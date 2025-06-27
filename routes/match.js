const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const { URLSearchParams } = require('url');
const path = require('path');

// Configurações
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/match/callback';
const SCOPES = 'user-top-read user-read-private user-read-email playlist-modify-public playlist-modify-private user-read-currently-playing';

// URLs do Spotify
const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const DEEZER_API_URL = 'https://api.deezer.com';

const AUTH_URL = `${SPOTIFY_ACCOUNTS_URL}/authorize`;
const TOKEN_URL = `${SPOTIFY_ACCOUNTS_URL}/api/token`;

const STATE_KEY = 'spotify_auth_state';
const USER_KEY = 'spotify_user_number';
const PLAYLIST_COVER_IMAGE_URL = 'https://i.ibb.co/vH2b2Xp/spotify-match-cover.jpg';

// --- Funções Auxiliares ---

const generateRandomString = (length) => {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

const getSessionData = (req, key, defaultValue = null) => {
    return req && req.session && req.session[key] !== undefined ? req.session[key] : defaultValue;
};

const setSessionData = (req, key, value) => {
    if (req && req.session) {
        req.session[key] = value;
    } else {
        console.error(`Session object not found on request for setting key: ${key}.`);
    }
};

const deleteSessionData = (req, key) => {
    if (req && req.session) {
        delete req.session[key];
    } else {
        console.warn(`Session object not found on request for deleting key: ${key}.`);
    }
};

// --- Rotas de Autenticação ---

router.get('/login/:userNumber', (req, res) => {
    const userNumber = req.params.userNumber;
    if (userNumber !== '1' && userNumber !== '2') {
        return res.status(400).send('Número de usuário inválido (deve ser 1 ou 2)');
    }

    const state = generateRandomString(16);
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 300000,
        sameSite: 'Lax'
    };

    if (!req.session) {
        console.error("Session middleware not available. Cannot initiate login.");
        return res.status(500).send("Internal server error: Session not available.");
    }
    setSessionData(req, USER_KEY, userNumber);

    res.cookie(STATE_KEY, state, cookieOptions);

    const authRedirectUrl = new URL(AUTH_URL);
    const params = {
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state: state,
        show_dialog: true
    };
    Object.keys(params).forEach(key => authRedirectUrl.searchParams.append(key, params[key]));

    console.log(`Redirecting user ${userNumber} to Spotify for auth...`);
    res.redirect(authRedirectUrl.toString());
});

router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const storedState = req.cookies ? req.cookies[STATE_KEY] : null;
    const userNumber = getSessionData(req, USER_KEY);

    res.clearCookie(STATE_KEY);

    if (!req.session) {
        console.error("Session middleware not available during callback.");
        return res.redirect('/?error=session_unavailable');
    }

    deleteSessionData(req, USER_KEY);

    if (error) {
        console.error('Spotify auth callback error:', error);
        return res.redirect(`/?error=${encodeURIComponent('auth_failed')}&reason=${encodeURIComponent(error)}`);
    }
    if (!state || state !== storedState) {
        console.error('State mismatch error:', { received: state, expected: storedState });
        return res.redirect('/?error=state_mismatch');
    }
    if (!userNumber) {
        console.error('User number not found in session during callback.');
        return res.redirect('/?error=user_identification_failed');
    }

    console.log(`Callback received for user ${userNumber} with code.`);

    try {
        const tokenResponse = await axios({
            method: 'post',
            url: TOKEN_URL,
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            },
        });

        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        console.log(`Tokens obtained for user ${userNumber}.`);

        const tokenKey = `access_token_${userNumber}`;
        const refreshKey = `refresh_token_${userNumber}`;
        const expiresKey = `token_expires_${userNumber}`;

        setSessionData(req, tokenKey, access_token);
        if (refresh_token) {
            setSessionData(req, refreshKey, refresh_token);
            console.log(`Refresh token stored/updated for user ${userNumber}.`);
        } else {
            console.log(`No new refresh token received for user ${userNumber}. Keeping old one.`);
        }
        setSessionData(req, expiresKey, Date.now() + (expires_in * 1000));

        const profileResponse = await axios.get(`${SPOTIFY_API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        console.log(`Profile fetched for user ${userNumber}.`);

        const profileData = profileResponse.data;
        const userProfile = {
            id: profileData.id,
            displayName: profileData.display_name || `Usuário ${userNumber}`,
            imageUrl: profileData.images?.sort((a, b) => b.width - a.width)[0]?.url || profileData.images?.[0]?.url,
            country: profileData.country,
            product: profileData.product,
            uri: profileData.uri
        };
        setSessionData(req, `user_profile_${userNumber}`, userProfile);

        console.log(`User ${userNumber} (${userProfile.displayName}) successfully authenticated.`);
        res.redirect('/');

    } catch (error) {
        console.error('Error during token exchange or profile fetch:',
            error.response ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);

        if (req.session && userNumber) {
            deleteSessionData(req, `access_token_${userNumber}`);
            deleteSessionData(req, `refresh_token_${userNumber}`);
            deleteSessionData(req, `token_expires_${userNumber}`);
            deleteSessionData(req, `user_profile_${userNumber}`);
        }

        let errorMessage = 'Ocorreu um erro na autenticação com o Spotify.';
        if (error.response) {
            if (error.response.status === 400) {
                errorMessage = error.response.data?.error_description || 'Solicitação inválida para obter token.';
            } else if (error.response.status === 401) {
                errorMessage = 'Credenciais inválidas ou expiradas. Tente logar novamente.';
            } else {
                errorMessage = `Erro da API Spotify (${error.response.status}): ${error.response.data?.error?.message || error.response.statusText}`;
            }
        } else if (error.message) {
            errorMessage = `Erro de rede: ${error.message}`;
        }

        res.redirect(`/?error=${encodeURIComponent('auth_failed')}&reason=${encodeURIComponent(errorMessage)}`);
    }
});

// --- Funções de API Spotify & Deezer ---

async function ensureValidToken(req, userNumber) {
    const tokenKey = `access_token_${userNumber}`;
    const refreshKey = `refresh_token_${userNumber}`;
    const expiresKey = `token_expires_${userNumber}`;

    const accessToken = getSessionData(req, tokenKey);
    const expiresAt = getSessionData(req, expiresKey);
    const refreshToken = getSessionData(req, refreshKey);
    const now = Date.now();

    const refreshBuffer = 5 * 60 * 1000;
    if (accessToken && expiresAt && now < expiresAt - refreshBuffer) {
        return accessToken;
    }

    console.log(`Token for user ${userNumber} expired or nearing expiry (${(expiresAt - now) / 1000}s left). Refreshing...`);

    if (!refreshToken) {
        console.error(`No refresh token available for user ${userNumber}. Requires re-login.`);
        if (req.session) {
            deleteSessionData(req, tokenKey);
            deleteSessionData(req, refreshKey);
            deleteSessionData(req, expiresKey);
            deleteSessionData(req, `user_profile_${userNumber}`);
        }
        throw new Error('authentication_required');
    }

    try {
        const response = await axios({
            method: 'post',
            url: TOKEN_URL,
            data: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            },
        });

        const { access_token, expires_in, refresh_token: new_refresh_token } = response.data;
        setSessionData(req, tokenKey, access_token);
        setSessionData(req, expiresKey, now + (expires_in * 1000));
        if (new_refresh_token) {
            setSessionData(req, refreshKey, new_refresh_token);
            console.log(`New refresh token received and stored for user ${userNumber}.`);
        } else {
            console.log(`No new refresh token provided for user ${userNumber}. Keeping old one.`);
        }

        console.log(`Token successfully refreshed for user ${userNumber}. New expiry in ${expires_in} seconds.`);
        return access_token;

    } catch (error) {
        console.error(`Error refreshing token for user ${userNumber}:`,
            error.response ? `Status ${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message);
        if (error.response?.status === 400 && error.response.data?.error === 'invalid_grant') {
            console.error(`Invalid refresh token for user ${userNumber}. Clearing session data.`);
            if (req.session) {
                deleteSessionData(req, tokenKey);
                deleteSessionData(req, refreshKey);
                deleteSessionData(req, expiresKey);
                deleteSessionData(req, `user_profile_${userNumber}`);
            }
            throw new Error('authentication_required');
        } else if (error.response?.status === 401) {
            console.error(`Unauthorized error during token refresh for user ${userNumber}. Clearing session data.`);
            if (req.session) {
                deleteSessionData(req, tokenKey);
                deleteSessionData(req, refreshKey);
                deleteSessionData(req, expiresKey);
                deleteSessionData(req, `user_profile_${userNumber}`);
            }
            throw new Error('authentication_required');
        }
        throw new Error('token_refresh_failed');
    }
}

async function getPaginatedSpotifyData(token, endpointType, timeRange = 'medium_term', limit = 200) {
    let allItems = [];
    const maxLimitPerRequest = 50; // Spotify's max per request

    let url = `${SPOTIFY_API_URL}/me/top/${endpointType}?limit=${maxLimitPerRequest}&time_range=${timeRange}`;
    console.log(`Fetching paginated data for endpoint: /me/top/${endpointType}, time range: ${timeRange}, requested limit: ${limit}`);

    let fetchedCount = 0;
    try {
        while (url && fetchedCount < limit) {
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 20000
            });

            if (response.data?.items) {
                allItems = allItems.concat(response.data.items);
                fetchedCount += response.data.items.length;
            } else {
                console.warn(`Unexpected response structure from ${url} for ${endpointType}:`, response.data);
                break;
            }
            
            url = response.data.next && fetchedCount < limit ? response.data.next : null;
            if (url && response.data.items.length === 0) {
                console.warn(`Pagination returned 0 items for ${endpointType} at ${url}. Stopping.`);
                break;
            }
        }
        console.log(`Fetched ${allItems.length} items for ${endpointType} (up to limit ${limit}).`);
        return allItems.slice(0, limit);

    } catch (error) {
        console.error(`Error fetching paginated data from /me/top/${endpointType}:`,
            error.response ? `Status ${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message);

        if (error.response?.status === 401) {
            throw new Error('authentication_required');
        } else if (error.response?.status === 429) {
            console.warn("Rate limit hit for Spotify API.");
            throw new Error('rate_limit_exceeded');
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            console.error("Request timeout fetching Spotify data.");
            throw new Error('spotify_api_timeout');
        }
        throw new Error(`spotify_api_error: Failed to fetch /me/top/${endpointType} - ${error.message}`);
    }
}

async function searchDeezerForTrackPreview(trackName, artistName) {
    const query = `artist:"${artistName}" track:"${trackName}"`;
    const searchUrl = `${DEEZER_API_URL}/search?q=${encodeURIComponent(query)}`;

    try {
        const response = await axios.get(searchUrl, { timeout: 8000 });
        const data = response.data;

        if (data && data.data && data.data.length > 0) {
            const bestMatch = data.data.find(item =>
                item.title.toLowerCase() === trackName.toLowerCase() &&
                item.artist?.name?.toLowerCase() === artistName.toLowerCase()
            ) || data.data[0];

            if (bestMatch?.preview) {
                return bestMatch.preview;
            }
        }
        return null;
    } catch (error) {
        console.error(`Error searching Deezer for "${trackName}" by ${artistName}:`,
            error.response ? `Status ${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message);
        return null;
    }
}

// --- Lógica de Análise de Compatibilidade ---

function calculateSimilarity(items1, items2, key = 'id') {
    if (!items1 || !items2) return [];
    const map1 = new Map(items1.map(item => item ? [item[key], item] : null).filter(pair => pair !== null));
    const common = [];
    const commonIds = new Set();

    for (const item2 of items2) {
        if (item2 && item2[key] !== null) {
            const id2 = item2[key];
            if (map1.has(id2) && !commonIds.has(id2)) {
                common.push(item2);
                commonIds.add(id2);
            }
        }
    }
    return common;
}

function analyzeGenres(artists, limit = 10) {
    if (!artists || artists.length === 0) return [];
    const genreCount = {};

    artists.forEach(artist => {
        if (artist?.genres) {
            artist.genres.forEach(genre => {
                const normalizedGenre = genre.toLowerCase().trim();
                if (normalizedGenre) {
                    genreCount[normalizedGenre] = (genreCount[normalizedGenre] || 0) + 1;
                }
            });
        }
    });

    const totalGenreOccurrences = Object.values(genreCount).reduce((sum, count) => sum + count, 0);

    if (totalGenreOccurrences === 0) return [];

    const sortedGenres = Object.entries(genreCount)
        .sort(([, countA], [, countB]) => countB - countA);

    return sortedGenres
        .slice(0, limit)
        .map(([genre, count]) => ({
            genre: genre,
            count: Math.round((count / artists.length) * 100)
        }))
        .filter(g => g.count > 0);
}

function analyzeCommonAlbums(user1Tracks, user2Tracks) {
    if (!user1Tracks || !user2Tracks) return [];

    const albumTrackCounts = new Map();

    const processTrack = (track, userId) => {
        if (!track?.album?.id) return;

        const album = track.album;
        const albumId = album.id;

        if (!albumTrackCounts.has(albumId)) {
            albumTrackCounts.set(albumId, {
                data: {
                    id: albumId,
                    name: album.name || 'Álbum Desconhecido',
                    artist: album.artists?.map(a => a.name).join(', ') || 'Artista Desconhecido',
                    imageUrl: album.images?.sort((a, b) => b.width - a.width).find(img => img.width >= 150)?.url || album.images?.[0]?.url || 'https://via.placeholder.com/150?text=Album',
                    url: album.external_urls?.spotify || '#',
                    year: album.release_date?.split('-')[0] || '',
                },
                users: new Set(),
                trackIds: new Set()
            });
        }

        const entry = albumTrackCounts.get(albumId);
        entry.users.add(userId);
        entry.trackIds.add(track.id);
    };

    user1Tracks.forEach(track => processTrack(track, 'user1'));
    user2Tracks.forEach(track => processTrack(track, 'user2'));

    const commonAlbumsData = [];
    albumTrackCounts.forEach(entry => {
        if (entry.users.has('user1') && entry.users.has('user2')) {
            entry.data.trackCount = entry.trackIds.size;
            commonAlbumsData.push(entry.data);
        }
    });

    return commonAlbumsData.sort((a, b) => b.trackCount - a.trackCount);
}

function calculateCompatibilityScore(data) {
    if (!data?.user1TopTracks || !data?.user2TopTracks || !data?.user1TopArtists || !data?.user2TopArtists || !data?.commonTracks || !data?.commonArtists || !data?.commonAlbums || !data?.topGenres) {
        console.warn("Missing required data points for score calculation.", data);
        return 0;
    }

    // Aumentar o limite para 200 músicas e 100 artistas
    const user1TrackCount = Math.min(data.user1TopTracks.length, 200);
    const user2TrackCount = Math.min(data.user2TopTracks.length, 200);
    const user1ArtistCount = Math.min(data.user1TopArtists.length, 100);
    const user2ArtistCount = Math.min(data.user2TopArtists.length, 100);

    // Fator 1: Sobreposição de músicas (maior peso)
    const trackOverlap = data.commonTracks.length / Math.min(user1TrackCount, user2TrackCount);
    
    // Fator 2: Sobreposição de artistas
    const artistOverlap = data.commonArtists.length / Math.min(user1ArtistCount, user2ArtistCount);
    
    // Fator 3: Gêneros em comum (considerar apenas os top 5 gêneros)
    const genreOverlap = Math.min(data.topGenres.length / 5, 1);
    
    // Fator 4: Posição relativa dos itens em comum
    let rankScore = 0;
    if (data.commonTracks.length > 0) {
        const maxRank = Math.max(user1TrackCount, user2TrackCount);
        data.commonTracks.forEach(track => {
            const rank1 = data.user1TopTracks.findIndex(t => t.id === track.id) + 1;
            const rank2 = data.user2TopTracks.findIndex(t => t.id === track.id) + 1;
            
            // Pontuação baseada na posição (itens no topo valem mais)
            const score1 = 1 - (rank1 / maxRank);
            const score2 = 1 - (rank2 / maxRank);
            rankScore += (score1 + score2) / 2;
        });
        rankScore = rankScore / data.commonTracks.length; // Normalizar
    }

    // Fator 5: Popularidade média das músicas em comum
    let popularityScore = 0;
    if (data.commonTracks.length > 0) {
        const totalPopularity = data.commonTracks.reduce((sum, track) => sum + (track.popularity || 50), 0);
        popularityScore = (totalPopularity / data.commonTracks.length) / 100; // Normalizar para 0-1
    }

    // Novos pesos ajustados
    const weights = {
        tracks: 0.45,    // 45% peso para músicas em comum
        artists: 0.25,   // 25% peso para artistas em comum
        genres: 0.1,     // 10% peso para gêneros
        rank: 0.1,       // 10% peso para posição
        popularity: 0.1  // 10% peso para popularidade
    };

    // Cálculo final
    const rawScore = 
        (trackOverlap * weights.tracks) +
        (artistOverlap * weights.artists) +
        (genreOverlap * weights.genres) +
        (rankScore * weights.rank) +
        (popularityScore * weights.popularity);

    // Ajustar para ficar entre 0 e 100
    let finalScore = Math.round(rawScore * 100);

    // Aplicar um fator de ajuste para aproximar dos valores do Spotify
    finalScore = Math.min(100, finalScore * 1.3);

    console.log(`Detalhes do cálculo de compatibilidade:
        Músicas em comum: ${data.commonTracks.length}/${Math.min(user1TrackCount, user2TrackCount)} (${(trackOverlap * 100).toFixed(1)}%)
        Artistas em comum: ${data.commonArtists.length}/${Math.min(user1ArtistCount, user2ArtistCount)} (${(artistOverlap * 100).toFixed(1)}%)
        Gêneros em comum: ${data.topGenres.length}/5 (${(genreOverlap * 100).toFixed(1)}%)
        Pontuação de posição: ${(rankScore * 100).toFixed(1)}%
        Pontuação de popularidade: ${(popularityScore * 100).toFixed(1)}%
        Pontuação final: ${finalScore}%`);

    return finalScore;
}

// --- Rota Principal de Cálculo ---

const matchDataCache = new Map();

router.get('/calculate', async (req, res) => {
    const { time_range = 'medium_term' } = req.query;
    const spotifyTrackLimit = 200; // Aumentado para 200 músicas
    const spotifyArtistLimit = 100; // Aumentado para 100 artistas
    let token1, token2;
    let user1Profile, user2Profile;
    const sessionId = req.sessionID;

    console.log(`Calculating match for session ${sessionId} for time range: ${time_range}`);

    try {
        [token1, token2] = await Promise.all([
            ensureValidToken(req, '1'),
            ensureValidToken(req, '2')
        ]).catch(error => {
            if (error.message === 'authentication_required') throw new Error('authentication_required');
            if (error.message === 'token_refresh_failed') throw new Error('token_refresh_failed');
            throw new Error('token_validation_failed');
        });
        
        user1Profile = getSessionData(req, 'user_profile_1');
        user2Profile = getSessionData(req, 'user_profile_2');

        if (!token1 || !token2 || !user1Profile || !user2Profile) {
            console.error("Missing token or profile data after token validation.");
            if (req.session) {
                deleteSessionData(req, 'access_token_1'); deleteSessionData(req, 'refresh_token_1'); deleteSessionData(req, 'token_expires_1'); deleteSessionData(req, 'user_profile_1');
                deleteSessionData(req, 'access_token_2'); deleteSessionData(req, 'refresh_token_2'); deleteSessionData(req, 'token_expires_2'); deleteSessionData(req, 'user_profile_2');
            }
            return res.status(401).json({ error: 'authentication_incomplete', message: 'Ambos os usuários precisam estar logados e ter perfis válidos. Tente fazer login novamente.' });
        }
        
        const isSameUser = (user1Profile.id === user2Profile.id);
        if (isSameUser) {
            console.log(`Same user logged in as both (${user1Profile.displayName}).`);
        }

        console.log(`Tokens validated for ${user1Profile.displayName} and ${user2Profile.displayName}. Fetching top items...`);

        // Fetch top items concurrently with increased limits
        const [user1TopTracks, user1TopArtists, user2TopTracks, user2TopArtists] = await Promise.all([
            getPaginatedSpotifyData(token1, 'tracks', time_range, spotifyTrackLimit),
            getPaginatedSpotifyData(token1, 'artists', time_range, spotifyArtistLimit),
            getPaginatedSpotifyData(token2, 'tracks', time_range, spotifyTrackLimit),
            getPaginatedSpotifyData(token2, 'artists', time_range, spotifyArtistLimit)
        ]).catch(error => {
            console.error("Error fetching data in Promise.all:", error.message);
            if (error.message === 'authentication_required') throw new Error('authentication_required');
            if (error.message === 'rate_limit_exceeded') throw new Error('rate_limit_exceeded');
            if (error.message === 'spotify_api_timeout') throw new Error('spotify_api_timeout');
            if (error.message.startsWith('spotify_api_error')) throw error;
            throw new Error('spotify_data_fetch_failed');
        });
        
        console.log(`Spotify data fetched. User1 Tracks: ${user1TopTracks.length}, Artists: ${user1TopArtists.length}. User2 Tracks: ${user2TopTracks.length}, Artists: ${user2TopArtists.length}.`);
        console.log("Analyzing commonalities...");

        // --- Analysis ---
        const commonTracks = calculateSimilarity(user1TopTracks, user2TopTracks);
        const commonArtists = calculateSimilarity(user1TopArtists, user2TopArtists);
        const commonAlbums = analyzeCommonAlbums(user1TopTracks, user2TopTracks);
        const topGenres = analyzeGenres(commonArtists, 10);

        // --- Populate Deezer Previews ---
        const commonTracksWithPreviews = await Promise.all(commonTracks.map(async track => {
            if (track && !track.preview_url && track.name && track.artists?.[0]?.name) {
                await new Promise(resolve => setTimeout(resolve, 50));
                const deezerPreview = await searchDeezerForTrackPreview(track.name, track.artists[0].name);
                if (deezerPreview) {
                    return { ...track, preview_url: deezerPreview };
                }
            }
            return track;
        })).catch(err => {
            console.error("Error fetching Deezer previews:", err);
            return commonTracks;
        });
        
        console.log(`Processed ${commonTracksWithPreviews.length} common tracks for previews.`);

        // --- Calculate Score ---
        const compatibilityScore = isSameUser ? 100 : calculateCompatibilityScore({
            user1TopTracks, user2TopTracks, user1TopArtists, user2TopArtists,
            commonTracks: commonTracksWithPreviews,
            commonArtists, commonAlbums, topGenres
        });
        
        console.log(`Analysis complete. Compatibility Score: ${compatibilityScore}%`);

        // --- Format Results for Frontend ---
        const formatTrack = (track) => {
            if (!track) return null;
            return {
                id: track.id,
                name: track.name || 'Nome Desconhecido',
                artists: track.artists?.map(a => a.name).join(', ') || 'Artista Desconhecido',
                album: track.album?.name || 'Álbum Desconhecido',
                imageUrl: track.album?.images?.sort((a, b) => a.width - b.width).find(img => img.width >= 80)?.url || track.album?.images?.[0]?.url || 'https://via.placeholder.com/80?text=Track',
                url: track.external_urls?.spotify || '#',
                previewUrl: track.preview_url || '',
                uri: track.uri,
                popularity: track.popularity || 0
            };
        };

        const formatArtist = (artist) => {
            if (!artist) return null;
            return {
                id: artist.id,
                name: artist.name || 'Nome Desconhecido',
                genres: artist.genres?.join(', ') || '',
                imageUrl: artist.images?.sort((a, b) => a.width - b.width).find(img => img.width >= 80)?.url || artist.images?.[0]?.url || 'https://via.placeholder.com/80?text=Artist',
                url: artist.external_urls?.spotify || '#',
                uri: artist.uri,
                popularity: artist.popularity || 0
            };
        };

        const formatAlbum = (album) => {
            if (!album) return null;
            return {
                id: album.id,
                name: album.name || 'Nome Desconhecido',
                artist: album.artist || 'Artista Desconhecido',
                year: album.year || '',
                trackCount: album.trackCount || 0,
                imageUrl: album.imageUrl || 'https://via.placeholder.com/150?text=Album',
                url: album.url || '#',
                uri: album.uri
            };
        };

        const results = {
            commonTracks: commonTracksWithPreviews.map(formatTrack).filter(t => t),
            commonArtists: commonArtists.map(formatArtist).filter(a => a),
            commonAlbums: commonAlbums.map(formatAlbum).filter(al => al),
            topGenres,
            compatibilityScore: compatibilityScore,
            user1Profile: user1Profile,
            user2Profile: user2Profile,
            timeRange: time_range
        };

        console.log(`Sending ${results.commonTracks.length} common tracks, ${results.commonArtists.length} common artists, ${results.commonAlbums.length} common albums, ${results.topGenres.length} common genres.`);

        matchDataCache.set(sessionId, results);
        console.log(`Match data cached for session ${sessionId}.`);

        res.json(results);

    } catch (error) {
        console.error("Error in /calculate endpoint:", error.message);
        let status = 500;
        let errorCode = 'internal_server_error';
        let message = 'Erro interno ao calcular compatibilidade.';

        if (error.message === 'authentication_required' || error.message === 'token_validation_failed' || error.message === 'token_refresh_failed' || error.message === 'authentication_incomplete') {
            status = 401; errorCode = 'authentication_required'; message = 'Sessão inválida ou expirada. Faça login novamente.';
            if (req.session) {
                deleteSessionData(req, 'access_token_1'); deleteSessionData(req, 'refresh_token_1'); deleteSessionData(req, 'token_expires_1'); deleteSessionData(req, 'user_profile_1');
                deleteSessionData(req, 'access_token_2'); deleteSessionData(req, 'refresh_token_2'); deleteSessionData(req, 'token_expires_2'); deleteSessionData(req, 'user_profile_2');
            }
        } else if (error.message === 'spotify_data_fetch_failed' || error.message.startsWith('spotify_api_error: Failed to fetch')) {
            status = 502; errorCode = 'spotify_api_error'; message = 'Não foi possível buscar os dados do Spotify. Tente novamente mais tarde.';
        } else if (error.message === 'spotify_api_timeout') {
            status = 504; errorCode = 'spotify_api_timeout'; message = 'A requisição ao Spotify demorou demais. Tente novamente.';
        } else if (error.message === 'rate_limit_exceeded') {
            status = 429; errorCode = 'spotify_rate_limit'; message = 'Limite de requisições ao Spotify excedido. Espere um pouco e tente novamente.';
        } else if (error.response) {
            status = error.response.status;
            const spotifyError = error.response.data?.error;
            message = spotifyError?.message || error.response.statusText || 'Erro ao comunicar com a API do Spotify.';
            if (status === 401) errorCode = 'spotify_unauthorized_playlist';
            else if (status === 403) errorCode = 'spotify_forbidden_playlist';
            else if (status === 429) errorCode = 'spotify_rate_limit_playlist';
            else if (status === 400) errorCode = 'spotify_bad_request_playlist';
            else errorCode = `spotify_error_${status}_playlist`;
        }

        matchDataCache.delete(sessionId);
        console.log(`Cached data cleared for session ${sessionId} due to error.`);

        res.status(status).json({ error: errorCode, message: message });
    }
});

// --- Rota para Criar Playlist ---

router.post('/create-playlist', async (req, res) => {
    let token1;
    let user1Profile, user2Profile;
    const sessionId = req.sessionID;

    console.log(`Received request to create playlist for session ${sessionId}.`);

    const cachedMatchData = matchDataCache.get(sessionId);
    const tracksToAdd = (cachedMatchData?.commonTracks || []).map(track => track.uri).filter(uri => uri);

    if (!tracksToAdd || !Array.isArray(tracksToAdd) || tracksToAdd.length === 0) {
        return res.status(400).json({ error: 'missing_tracks', message: 'Nenhuma música em comum encontrada na sessão para criar a playlist. Por favor, recalcule a compatibilidade.' });
    }
    
    const urisToAddToPlaylist = tracksToAdd.slice(0, 100);

    try {
        token1 = await ensureValidToken(req, '1').catch(error => {
            if (error.message === 'authentication_required') throw new Error('authentication_required');
            throw new Error('token_validation_failed_playlist');
        });

        user1Profile = getSessionData(req, 'user_profile_1');
        user2Profile = getSessionData(req, 'user_profile_2');

        if (!token1 || !user1Profile || !user2Profile) {
            console.error("Missing token or profile data for User 1 during playlist creation.");
            if (req.session) {
                deleteSessionData(req, 'access_token_1'); deleteSessionData(req, 'refresh_token_1'); deleteSessionData(req, 'token_expires_1'); deleteSessionData(req, 'user_profile_1');
            }
            throw new Error('authentication_required');
        }

        const userId1 = user1Profile.id;
        console.log(`User ${user1Profile.displayName} authenticated to create playlist.`);

        const timeRangeFromCache = cachedMatchData?.timeRange || req.query.time_range || 'últimos 6 meses';

        const playlistName = `Match ${user1Profile.displayName} & ${user2Profile.displayName} (${urisToAddToPlaylist.length})`;
        const playlistDescription = `Playlist gerada pelo Spotify Match Ultra+ com ${urisToAddToPlaylist.length} música${urisToAddToPlaylist.length !== 1 ? 's' : ''} em comum (${timeRangeFromCache}).`;
        
        console.log(`Attempting to create playlist named: "${playlistName}" for user ${userId1}`);

        // 1. Create Playlist
        const createPlaylistResponse = await axios.post(
            `${SPOTIFY_API_URL}/users/${userId1}/playlists`,
            { name: playlistName, description: playlistDescription, public: true, collaborative: false },
            { headers: { 'Authorization': `Bearer ${token1}`, 'Content-Type': 'application/json' } }
        );
        
        const newPlaylist = createPlaylistResponse.data;
        const playlistId = newPlaylist.id;
        console.log(`Playlist created successfully. ID: ${playlistId}, URL: ${newPlaylist.external_urls.spotify}`);

        // 2. Add Tracks
        if (urisToAddToPlaylist.length > 0) {
            console.log(`Adding ${urisToAddToPlaylist.length} tracks to playlist ${playlistId}...`);
            
            await axios.post(
                `${SPOTIFY_API_URL}/playlists/${playlistId}/tracks`,
                { uris: urisToAddToPlaylist },
                { headers: { 'Authorization': `Bearer ${token1}`, 'Content-Type': 'application/json' } }
            );
            console.log("Tracks added successfully.");
        } else {
            console.warn("No tracks to add to the playlist.");
        }

        // 3. Upload Cover Image
        try {
            console.log("Attempting to upload playlist cover image...");
            const imageResponse = await axios.get(PLAYLIST_COVER_IMAGE_URL, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data);
            const base64Image = imageBuffer.toString('base64');

            await axios.put(
                `${SPOTIFY_API_URL}/playlists/${playlistId}/images`,
                base64Image,
                {
                    headers: {
                        'Authorization': `Bearer ${token1}`,
                        'Content-Type': 'image/jpeg'
                    }
                }
            );
            console.log("Playlist cover image upload attempted.");

        } catch (imageError) {
            console.error("Error uploading playlist cover image:",
                imageError.response ? `Status ${imageError.response.status} - ${JSON.stringify(imageError.response.data)}` : imageError.message);
        }

        // 4. Return Response
        res.status(201).json({
            playlistUrl: newPlaylist.external_urls.spotify,
            playlistId: playlistId,
            playlistName: newPlaylist.name,
            trackCount: urisToAddToPlaylist.length
        });

    } catch (error) {
        console.error("Error during playlist creation:",
            error.response ? `Status ${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message);
        
        let status = 500; 
        let errorCode = 'playlist_creation_failed'; 
        let message = 'Erro desconhecido ao criar a playlist no Spotify.';

        if (error.message === 'authentication_required' || error.message === 'token_validation_failed_playlist') {
            status = 401; 
            errorCode = 'authentication_required'; 
            message = 'Autenticação necessária ou expirada para criar a playlist. Faça login novamente com o Usuário 1.';
            
            if (req.session) {
                deleteSessionData(req, 'access_token_1'); 
                deleteSessionData(req, 'refresh_token_1'); 
                deleteSessionData(req, 'token_expires_1'); 
                deleteSessionData(req, 'user_profile_1');
            }
        } else if (error.response) {
            status = error.response.status;
            const spotifyError = error.response.data?.error;
            message = spotifyError?.message || error.response.statusText || 'Erro ao comunicar com a API do Spotify durante a criação da playlist.';
            
            if (status === 401) errorCode = 'spotify_unauthorized_playlist';
            else if (status === 403) {
                if (spotifyError?.message?.includes('Premium required')) {
                    errorCode = 'not_premium';
                    message = 'A criação de playlist pode exigir uma conta Spotify Premium.';
                } else {
                    errorCode = 'spotify_forbidden_playlist';
                    message = 'Você não tem permissão para realizar esta ação no Spotify.';
                }
            }
            else if (status === 429) errorCode = 'spotify_rate_limit_playlist';
            else if (status === 400) errorCode = 'spotify_bad_request_playlist';
            else errorCode = `spotify_error_${status}_playlist`;
        }

        res.status(status).json({ error: errorCode, message: message });
    }
});

// --- Rota de Status ---

router.get('/auth/status', (req, res) => {
    const user1LoggedIn = !!(getSessionData(req, 'access_token_1') && getSessionData(req, 'user_profile_1'));
    const user2LoggedIn = !!(getSessionData(req, 'access_token_2') && getSessionData(req, 'user_profile_2'));

    res.json({
        user1LoggedIn: user1LoggedIn,
        user2LoggedIn: user2LoggedIn,
        user1Profile: user1LoggedIn ? getSessionData(req, 'user_profile_1') : null,
        user2Profile: user2LoggedIn ? getSessionData(req, 'user_profile_2') : null
    });
});

module.exports = router;