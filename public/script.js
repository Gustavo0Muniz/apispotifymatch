document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const loginUser1Btn = document.getElementById('loginUser1');
    const loginUser2Btn = document.getElementById('loginUser2');
    const calculateMatchBtn = document.getElementById('calculateMatchBtn');
    const createPlaylistBtn = document.getElementById('createPlaylistBtn');
    const downloadMatchBtn = document.getElementById('downloadMatchBtn');
    const timeRangeBtns = document.querySelectorAll('.time-range-btn');
    const user1Info = document.getElementById('user1Info');
    const user2Info = document.getElementById('user2Info');
    const user1Name = document.getElementById('user1Name');
    const user1Img = document.getElementById('user1Img');
    const user1Status = document.getElementById('user1Status');
    const user1Stats = document.getElementById('user1Stats'); // Container for user 1 stats
    const user2Name = document.getElementById('user2Name');
    const user2Img = document.getElementById('user2Img');
    const user2Status = document.getElementById('user2Status');
    const user2Stats = document.getElementById('user2Stats'); // Container for user 2 stats
    const resultsDiv = document.getElementById('results');
    const commonTracksList = document.getElementById('commonTracksList');
    const commonArtistsList = document.getElementById('commonArtistsList');
    const commonAlbumsList = document.getElementById('commonAlbumsList');
    const compatibilityScoreEl = document.getElementById('compatibilityScore');
    const compatibilityProgress = document.getElementById('compatibilityProgress');
    const compatibilityMessage = document.getElementById('compatibilityMessage');
    const commonTracksCountEl = document.getElementById('commonTracksCount');
    const commonArtistsCountEl = document.getElementById('commonArtistsCount');
    const commonAlbumsCountEl = document.getElementById('commonAlbumsCount');
    const matchScoreEl = document.getElementById('matchScore'); // Stat card score
    const commonTracksNum = document.getElementById('commonTracksNum');
    const commonArtistsNum = document.getElementById('commonArtistsNum');
    const commonAlbumsNum = document.getElementById('commonAlbumsNum');
    const errorMessage = document.getElementById('errorMessage');
    const errorContent = document.getElementById('errorContent');
    const loadingDiv = document.getElementById('loading');
    const playlistLink = document.getElementById('playlistLink');
    const playlistStats = document.getElementById('playlistStats');
    const generatedPlaylist = document.getElementById('generatedPlaylist');
    const toastNotification = document.getElementById('toastNotification');
    const genreTagsDiv = document.getElementById('genreTags');
    const genresChartCanvas = document.getElementById('genresChart');
    const genresChartContainer = document.querySelector('.genres-chart-section .chart-container');

    // --- Share Image Template Elements ---
    const shareImageTemplate = document.getElementById('shareImageTemplate');
    const shareUser1Img = document.getElementById('shareUser1Img');
    const shareUser2Img = document.getElementById('shareUser2Img');
    const shareUser1Name = document.getElementById('shareUser1Name');
    const shareUser2Name = document.getElementById('shareUser2Name');
    const shareCompatibilityScore = document.getElementById('shareCompatibilityScore');
    const shareTopTracksList = document.getElementById('shareTopTracksList');
    const shareTopArtistsList = document.getElementById('shareTopArtistsList');
    const shareTopAlbumsList = document.getElementById('shareTopAlbumsList');
    const shareCommonTrackSection = document.getElementById('shareCommonTrack');
    const shareTrackImage = document.getElementById('shareTrackImage');
    const shareTrackTitle = document.getElementById('shareTrackTitle');
    const shareTrackArtist = document.getElementById('shareTrackArtist');

    // --- Application State ---
    let user1LoggedIn = false;
    let user2LoggedIn = false;
    let user1ProfileData = null;
    let user2ProfileData = null;
    let currentTimeRange = 'medium_term'; // Default time range
    let genreChart = null;
    let currentPlayingAudio = null;
    let currentPlayingButton = null;
    let matchDataCache = null; // Cache for the latest match results
    let toastTimeout = null; // Timeout ID for hiding toast

    // --- Compatibility Messages (Keep existing) ---
    const compatibilityMessages = [
        { min: 0, max: 15, message: "Universos musicais bem distintos! Hora de explorar novos sons? 🧑‍🚀" },
        { min: 16, max: 30, message: "Poucos pontos em comum, mas a diversidade tem seu valor! 🤔" },
        { min: 31, max: 45, message: "Uma conexão musical inicial. Que tal descobrir mais juntos? 🙂" },
        { min: 46, max: 60, message: "Boa sintonia! Vocês compartilham vários gostos. 👍" },
        { min: 61, max: 75, message: "Ótima conexão! Muitas músicas para a playlist compartilhada. 🎉" },
        { min: 76, max: 90, message: "Excelente compatibilidade! Praticamente almas gêmeas musicais. <span class='fas fa-headphones-alt'></span>" },
        { min: 91, max: 99, message: "Incrivelmente compatíveis! A trilha sonora perfeita para vocês. 💖" },
        { min: 100, max: 100, message: "Match Perfeito! Sincronia musical absoluta! ✨" }
    ];

    // --- Helper Functions ---

    function showError(message, isSevere = false) {
        console.error("Error:", message);
        errorContent.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.classList.toggle('severe-error', isSevere);
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideError() {
        errorMessage.style.display = 'none';
        errorMessage.classList.remove('severe-error');
    }

    function showToast(message) {
        toastNotification.textContent = message;
        toastNotification.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastNotification.classList.remove('show');
        }, 3000);
    }

    // Update the entire UI based on login status
    async function updateUI(status) {
        user1LoggedIn = status.user1LoggedIn;
        user2LoggedIn = status.user2LoggedIn;
        user1ProfileData = status.user1Profile;
        user2ProfileData = status.user2Profile;

        updateUserCard(1, user1LoggedIn, user1ProfileData);
        updateUserCard(2, user2LoggedIn, user2ProfileData);

        const canCalculate = user1LoggedIn && user2LoggedIn;
        calculateMatchBtn.disabled = !canCalculate;
        calculateMatchBtn.classList.toggle('btn-disabled', !canCalculate);
        if (!canCalculate) {
            calculateMatchBtn.innerHTML = '<i class="fas fa-lock"></i> Conecte Ambos';
        } else if (!calculateMatchBtn.querySelector('i.fa-spinner')) {
             calculateMatchBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Calcular Compatibilidade';
        }

        if (!canCalculate && resultsDiv.style.display !== 'none') {
            console.log("Login status changed, clearing results.");
            clearResults();
        }
    }

    // Update a single user card - MODIFIED FOR PLACEHOLDER STATS
    function updateUserCard(userNum, isLoggedIn, profile) {
        const nameEl = document.getElementById(`user${userNum}Name`);
        const imgEl = document.getElementById(`user${userNum}Img`);
        const statusEl = document.getElementById(`user${userNum}Status`);
        const statsEl = document.getElementById(`user${userNum}Stats`); // Stats container
        const infoEl = document.getElementById(`user${userNum}Info`);
        const loginBtn = document.getElementById(`loginUser${userNum}`);
        const defaultAvatar = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';

        imgEl.src = defaultAvatar; // Set default first
        imgEl.setAttribute('crossorigin', 'anonymous'); // Ensure CORS for default/fallback

        if (isLoggedIn && profile) {
            loginBtn.innerHTML = '<i class="fas fa-check"></i> Conectado';
            loginBtn.classList.add('btn-logged');
            loginBtn.classList.remove('btn-secondary');
            loginBtn.disabled = true;

            nameEl.textContent = profile.displayName || `Usuário ${userNum}`;
            imgEl.src = profile.imageUrl || defaultAvatar;
            imgEl.onerror = () => { imgEl.src = defaultAvatar; }; // Fallback on error

            statusEl.textContent = `${profile.product || 'Spotify'} ${profile.country ? `(${profile.country})` : ''}`;
            infoEl.classList.add('active');

            // --- Display PLACEHOLDER stats ---
            // These numbers indicate the *potential* scope of data used (e.g., top 50)
            // They are NOT live counts fetched at login.
            statsEl.innerHTML = `
                 <div class="stat-item">
                     <div class="stat-value"><i class="fas fa-music"></i> ~50</div>
                     <div class="stat-label">Top Músicas</div>
                 </div>
                 <div class="stat-item">
                     <div class="stat-value"><i class="fas fa-users"></i> ~50</div>
                     <div class="stat-label">Top Artistas</div>
                 </div>
                 <div class="stat-item">
                     <div class="stat-value"><i class="fas fa-tag"></i> Vários</div>
                     <div class="stat-label">Gêneros</div>
                 </div>`;
            // --- End Placeholder Stats ---

        } else {
            // Reset to logged-out state
            loginBtn.innerHTML = `<i class="fab fa-spotify"></i> Conectar Usuário ${userNum}`;
            loginBtn.classList.remove('btn-logged');
            loginBtn.classList.add('btn-secondary');
            loginBtn.disabled = false;

            nameEl.textContent = `Usuário ${userNum}`;
            imgEl.src = defaultAvatar;
            statusEl.textContent = 'Não conectado';
            infoEl.classList.remove('active');

            // Reset stats to '-' placeholders when logged out
            statsEl.innerHTML = `
                <div class="stat-item"><div class="stat-value"><i class="fas fa-music"></i> -</div><div class="stat-label">Músicas</div></div>
                <div class="stat-item"><div class="stat-value"><i class="fas fa-users"></i> -</div><div class="stat-label">Artistas</div></div>
                <div class="stat-item"><div class="stat-value"><i class="fas fa-tag"></i> -</div><div class="stat-label">Gêneros</div></div>`;
        }
    }


    // Clear the results section and related state
    function clearResults() {
        if (currentPlayingAudio) {
            currentPlayingAudio.pause();
            currentPlayingAudio.onended = null;
            currentPlayingAudio.onpause = null;
            currentPlayingAudio = null;
        }
        if (currentPlayingButton) {
            resetPlayButton(currentPlayingButton); // Use helper to reset state
            currentPlayingButton = null;
        }

        const initialMessage = '<p class="no-items">Conecte ambos os usuários e calcule a compatibilidade.</p>';
        commonTracksList.innerHTML = initialMessage;
        commonArtistsList.innerHTML = initialMessage;
        commonAlbumsList.innerHTML = initialMessage;
        genreTagsDiv.innerHTML = '';

        compatibilityScoreEl.textContent = '-%';
        compatibilityMessage.textContent = '';
        if (compatibilityProgress) {
             compatibilityProgress.style.background = `conic-gradient(rgba(255, 255, 255, 0.08) 0% 100%)`;
        }

        commonTracksCountEl.textContent = '0';
        commonArtistsCountEl.textContent = '0';
        commonAlbumsCountEl.textContent = '0';
        matchScoreEl.textContent = '0%';
        commonTracksNum.textContent = '0';
        commonArtistsNum.textContent = '0';
        commonAlbumsNum.textContent = '0';

        if (genreChart) {
            genreChart.destroy();
            genreChart = null;
        }
        // Ensure canvas exists for next chart, clear placeholder if needed
        if (genresChartContainer.querySelector('.no-items')) {
            genresChartContainer.innerHTML = '<canvas id="genresChart"></canvas>';
        } else if (!genresChartContainer.querySelector('canvas')) {
             // If canvas is missing entirely
             genresChartContainer.innerHTML = '<canvas id="genresChart"></canvas>';
        }


        resultsDiv.style.display = 'none';
        generatedPlaylist.style.display = 'none';
        createPlaylistBtn.style.display = 'none';
        downloadMatchBtn.style.display = 'none';

        matchDataCache = null;
        hideError();
    }

    // Check auth status on load and handle query params
    async function initializeApp() {
        const urlParams = new URLSearchParams(window.location.search);
        const errorParam = urlParams.get('error');
        const reasonParam = urlParams.get('reason');
        if (errorParam) {
            showError(`Falha na autenticação: ${reasonParam || errorParam}`, true);
            window.history.replaceState({}, document.title, "/"); // Clean URL
        }

        try {
            const response = await fetch(`/match/auth/status?t=${Date.now()}`);
            if (!response.ok) throw new Error(`Erro ${response.status} ao buscar status`);
            const status = await response.json();
            await updateUI(status);
        } catch (error) {
            console.error('Erro ao verificar status de autenticação:', error);
            showError('Não foi possível verificar o status da conexão. Tente recarregar.', false);
            await updateUI({ user1LoggedIn: false, user2LoggedIn: false, user1Profile: null, user2Profile: null });
        }

        timeRangeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === currentTimeRange);
        });
    }


    // Create or update the genre doughnut chart
    function createGenreChart(genres) {
        const canvas = document.getElementById('genresChart');
         if (!canvas || !genresChartContainer) {
             console.error("Canvas or container element for genre chart not found.");
             if(genresChartContainer) genresChartContainer.innerHTML = '<p class="no-items">Erro ao carregar gráfico.</p>';
             return;
         }

        if (genreChart) {
            genreChart.destroy();
            genreChart = null;
        }
         // Clear placeholder if it exists, ensure canvas is there
        if (genresChartContainer.querySelector('.no-items')) {
            genresChartContainer.innerHTML = '';
            genresChartContainer.appendChild(canvas);
        }


        if (!genres || genres.length === 0) {
            genresChartContainer.innerHTML = '<p class="no-items">Nenhum gênero em comum proeminente encontrado.</p>';
            genreTagsDiv.innerHTML = '';
            return;
        }

        const ctx = canvas.getContext('2d');
        const chartColors = ['#1DB954', '#1ED760', '#FFC107', '#FF5722', '#E91E63','#9C27B0', '#3F51B5', '#03A9F4', '#00BCD4', '#4CAF50','#8BC34A', '#CDDC39', '#FFEB3B', '#FF9800', '#795548'];
        const backgroundColors = genres.map((_, index) => chartColors[index % chartColors.length]);

        if (typeof ChartDataLabels !== 'undefined') {
             try { Chart.register(ChartDataLabels); } catch (e) { /* Ignore if already registered */ }
        } else { console.warn("ChartDataLabels plugin not registered."); }

        genreChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: genres.map(g => g.genre.replace(/\b\w/g, l => l.toUpperCase())),
                datasets: [{
                    label: 'Gêneros em Comum (%)', data: genres.map(g => g.count),
                    backgroundColor: backgroundColors, borderColor: 'rgba(18, 18, 18, 0.7)',
                    borderWidth: 2, hoverOffset: 8, hoverBorderColor: '#fff'
                }]
            },
            options: { /* ... options as before ... */
                 responsive: true, maintainAspectRatio: false, cutout: '60%',
                 plugins: {
                     legend: { position: 'bottom', labels: { color: 'var(--spotify-gray)', font: { family: 'Open Sans', size: 11 }, boxWidth: 12, padding: 15, usePointStyle: true, pointStyle: 'rectRounded' }, maxWidth: (genresChartContainer?.offsetWidth || 300) - 40 },
                     tooltip: { enabled: true, backgroundColor: 'rgba(0, 0, 0, 0.85)', titleFont: { family: 'Montserrat', size: 13, weight: 'bold' }, bodyFont: { family: 'Open Sans', size: 12 }, padding: 10, boxPadding: 4, usePointStyle: true, callbacks: { label: (c) => `${c.label || ''}: ${c.raw}%` } },
                     datalabels: { display: (c) => c.raw > 5, formatter: (v) => `${v}%`, color: '#ffffff', font: { weight: 'bold', family: 'Montserrat', size: 11 }, textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowBlur: 3, anchor: 'end', align: 'end', offset: -10 }
                 },
                 animation: { animateScale: true, animateRotate: true, duration: 1000, easing: 'easeOutQuart' },
                 layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } }
            }
        });

        genreTagsDiv.innerHTML = genres.slice(0, 15).map( g => `<span class="genre-tag">${g.genre.replace(/\b\w/g, l => l.toUpperCase())}</span>`).join('');
    }


    // Create HTML for a single item card (track or artist)
    function createItemCard(item, type) {
        const card = document.createElement('div');
        card.className = `item-card animate__animated animate__fadeIn ${type}-card`; // Add type class

        const imageUrl = item.imageUrl || (type === 'artist' ? 'https://via.placeholder.com/60?text=A' : 'https://via.placeholder.com/60?text=T');
        const title = item.name || 'Título Desconhecido';
        const subtitle = type === 'track'
            ? `${item.artists || 'Artista Desconhecido'} ${item.album ? '• ' + item.album : ''}`
            : (item.genres || 'Gêneros Indisponíveis');
        const itemUrl = item.url || '#';
        const previewUrl = type === 'track' ? item.previewUrl || '' : '';

        card.innerHTML = `
            <img class="item-image" src="${imageUrl}" alt="${type === 'track' ? 'Capa' : 'Artista'}" loading="lazy" crossorigin="anonymous">
            <div class="item-info">
                <a href="${itemUrl}" target="_blank" rel="noopener noreferrer" class="item-title" title="${title}">${title}</a>
                <p class="item-subtitle" title="${subtitle}">${subtitle}</p>
                <div class="item-actions">
                    ${type === 'track' ? `
                        <button class="action-btn play-btn" title="${previewUrl ? 'Ouvir Prévia' : 'Prévia Indisponível'}" data-preview="${previewUrl}" ${!previewUrl ? 'disabled' : ''}>
                            <i class="fas ${previewUrl ? 'fa-play' : 'fa-ban'}"></i>
                        </button>
                    ` : `
                         <a href="${itemUrl}" target="_blank" rel="noopener noreferrer" class="action-btn artist-link-btn" title="Ver ${item.name || 'Artista'} no Spotify">
                             <i class="fab fa-spotify"></i>
                         </a>
                    `}
                    <button class="action-btn like-btn" title="Favoritar (Visual)" data-id="${item.id}" data-type="${type}">
                        <i class="far fa-heart"></i>
                    </button>
                    <button class="action-btn share-btn" title="Compartilhar ${type === 'track' ? 'Música' : 'Artista'}" data-url="${itemUrl}" data-title="${title}${type === 'track' && item.artists ? ' por ' + item.artists : ''}" data-type="${type}">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>
        `;

        card.querySelector('img').setAttribute('crossorigin', 'anonymous'); // Ensure CORS

        if (type === 'track') {
            const playButton = card.querySelector('.play-btn');
            if (playButton && previewUrl) {
                playButton.addEventListener('click', (e) => { e.stopPropagation(); playPreview(previewUrl, playButton); });
            }
        }

        card.querySelectorAll('.action-btn').forEach(btn => {
             if (btn.classList.contains('like-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(btn); });
             else if (btn.classList.contains('share-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); shareItem(btn.dataset.url, btn.dataset.title, btn.dataset.type); });
        });

        return card;
    }

    // Create HTML for a single album card
    function createAlbumItem(album) {
        const item = document.createElement('div');
        item.className = 'album-card animate__animated animate__fadeIn';
        const imageUrl = album.imageUrl || 'https://via.placeholder.com/130?text=Album';
        const title = album.name || 'Título Desconhecido';
        const artist = album.artist || 'Artista Desconhecido';
        const url = album.url || '#';
        const year = album.year || '';
        const trackCount = album.trackCount || 0;

        item.innerHTML = `
            <img class="album-image" src="${imageUrl}" alt="Capa ${title}" loading="lazy" crossorigin="anonymous">
            <div class="album-info">
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="album-title" title="${title}">${title}</a>
                <p class="album-artist">${artist}</p>
                <div class="album-meta">
                    ${year ? `<span><i class="fas fa-calendar-alt"></i> ${year}</span>` : ''}
                    ${trackCount > 0 ? `<span><i class="fas fa-music"></i> ${trackCount}</span>` : ''}
                </div>
                 <div class="item-actions" style="justify-content: center; margin-top: 10px;">
                     <button class="action-btn like-btn" title="Favoritar Álbum" data-id="${album.id}" data-type="album"><i class="far fa-heart"></i></button>
                     <button class="action-btn share-btn" title="Compartilhar Álbum" data-url="${url}" data-title="${title}${artist ? ' por ' + artist : ''}" data-type="album"><i class="fas fa-share-alt"></i></button>
                 </div>
            </div>
        `;
         item.querySelector('img').setAttribute('crossorigin', 'anonymous'); // Ensure CORS
         item.querySelectorAll('.action-btn').forEach(btn => {
              if (btn.classList.contains('like-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(btn); });
              else if (btn.classList.contains('share-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); shareItem(btn.dataset.url, btn.dataset.title, btn.dataset.type); });
         });
        return item;
    }


    // Populate an item grid (tracks, artists, albums)
    function populateItemGrid(elementId, items, type) {
        const gridElement = document.getElementById(elementId);
        const countElement = document.getElementById(`${elementId.replace('List', 'Num')}`);
        gridElement.innerHTML = ''; // Clear previous items

        if (!items || items.length === 0) {
            const typeName = type === 'track' ? 'músicas' : type === 'artist' ? 'artistas' : 'álbuns';
            gridElement.innerHTML = `<p class="no-items">Nenhum ${typeName} em comum encontrado.</p>`;
            if (countElement) countElement.textContent = '0';
        } else {
            const fragment = document.createDocumentFragment();
            items.forEach((item) => {
                 const card = (type === 'album') ? createAlbumItem(item) : createItemCard(item, type);
                 fragment.appendChild(card);
             });
            gridElement.appendChild(fragment);
            if (countElement) countElement.textContent = items.length;
        }
    }

    // Update the compatibility score display (circle/progress and text)
    function updateCompatibilityDisplay(score) {
        score = Math.max(0, Math.min(100, parseInt(score, 10) || 0));
        compatibilityScoreEl.textContent = `${score}%`;
        matchScoreEl.textContent = `${score}%`;

        if (compatibilityProgress) {
             const percentage = score;
             compatibilityProgress.style.background = `conic-gradient(var(--spotify-green) ${percentage}%, rgba(255, 255, 255, 0.08) ${percentage}% 100%)`;
        }

        const messageData = compatibilityMessages.find(m => score >= m.min && score <= m.max);
        compatibilityMessage.innerHTML = messageData ? messageData.message : 'Analise sua compatibilidade!';
    }

    // Handle audio preview playback
    function playPreview(previewUrl, button) {
        if (!previewUrl || previewUrl === '#' || button.disabled) {
             showToast('Prévia não disponível.');
             return;
        }

        if (currentPlayingButton === button && currentPlayingAudio) {
            if (!currentPlayingAudio.paused) currentPlayingAudio.pause();
            else {
                currentPlayingAudio.play().catch(e => { console.error("Resume Error:", e); showError("Erro ao tocar prévia."); resetPlayButton(button); });
                button.innerHTML = '<i class="fas fa-pause"></i>'; button.classList.remove('loading'); button.title = 'Pausar Prévia';
            }
            return;
        }

        if (currentPlayingAudio) {
            currentPlayingAudio.pause();
            currentPlayingAudio.onended = null; currentPlayingAudio.onpause = null;
            if (currentPlayingButton) resetPlayButton(currentPlayingButton);
        }

        currentPlayingAudio = new Audio(previewUrl);
        currentPlayingButton = button;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; button.classList.add('loading'); button.title = 'Carregando...';

        currentPlayingAudio.play()
            .then(() => {
                if (button === currentPlayingButton) {
                    button.innerHTML = '<i class="fas fa-pause"></i>'; button.classList.remove('loading'); button.title = 'Pausar Prévia';
                } else { currentPlayingAudio.pause(); return; } // Button changed while loading

                 currentPlayingAudio.onended = () => { if (button === currentPlayingButton) { resetPlayButton(button); currentPlayingAudio = null; currentPlayingButton = null; } };
                 currentPlayingAudio.onpause = () => { if (button === currentPlayingButton && !currentPlayingAudio.ended) resetPlayButton(button); };
            })
            .catch(error => {
                console.error('Erro ao tocar prévia:', error); showError('Não foi possível tocar a prévia.');
                if (button === currentPlayingButton) { resetPlayButton(button); currentPlayingAudio = null; currentPlayingButton = null; }
            });
    }

    // Helper to reset a play button to its initial state
    function resetPlayButton(button) {
         if (!button) return;
         const hasPreview = button.dataset.preview && button.dataset.preview !== '';
         button.innerHTML = `<i class="fas ${hasPreview ? 'fa-play' : 'fa-ban'}"></i>`;
         button.classList.remove('loading');
         button.title = hasPreview ? 'Ouvir Prévia' : 'Prévia Indisponível';
         button.disabled = !hasPreview;
    }


    // Toggle visual like state
    function toggleLike(button) {
        const icon = button.querySelector('i');
        const isLiked = button.classList.toggle('liked');
        const itemType = button.dataset.type || 'item';
        const typeName = itemType === 'track' ? 'Música' : itemType === 'artist' ? 'Artista' : 'Álbum';
        if (isLiked) {
            icon.classList.replace('far', 'fas'); button.title = `Desfavoritar ${typeName} (Visual)`;
            showToast(`${typeName} favoritada! (Visual)`);
        } else {
            icon.classList.replace('fas', 'far'); button.title = `Favoritar ${typeName} (Visual)`;
            showToast(`Favorito removido! (Visual)`);
        }
    }

    // Share item using Web Share API or fallback to clipboard
    async function shareItem(url, title, type = 'item') {
         if (!url || url === '#') { showToast("Link inválido para compartilhar."); return; }
        const typeName = type === 'track' ? 'esta música' : type === 'artist' ? 'este artista' : type === 'album' ? 'este álbum' : 'este item';
        const shareData = { title: `Confira ${typeName} no Spotify!`, text: `Dê uma olhada em "${title}" no Spotify!`, url: url };
        try {
            if (navigator.share) await navigator.share(shareData);
            else copyToClipboard(url, title, type); // Fallback
        } catch (error) {
            if (error.name !== 'AbortError') { console.error('Erro ao compartilhar:', error); copyToClipboard(url, title, type); }
        }
    }

    // Copy text to clipboard with user feedback
    function copyToClipboard(text, title, type) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Link para "${title}" copiado!`);
        }).catch(err => { console.error('Falha ao copiar: ', err); showError('Não foi possível copiar o link.'); });
    }


    // --- Share Image Generation ---

    // Creates list items for the share image template (Tracks/Artists)
    function createShareListItemWithImage(item, type) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'share-list-item-with-image';
        const imageUrl = item.imageUrl || (type === 'artist' ? 'https://via.placeholder.com/50?text=A' : 'https://via.placeholder.com/50?text=T');
        const titleText = item.name || 'Desconhecido';
        const subtitleText = type === 'track' ? item.artists || 'Desconhecido' :
                             type === 'artist' ? item.genres?.split(',')[0]?.trim() || 'Gênero' : '';
        itemDiv.innerHTML = `
            <img class="share-list-item-image" src="${imageUrl}" alt="${type} image" ${type === 'artist' ? 'style="border-radius: 50%;"' : ''} crossorigin="anonymous">
            <div class="share-list-item-info">
                 <div class="share-list-item-title">${titleText}</div>
                 ${subtitleText ? `<div class="share-list-item-subtitle">${subtitleText}</div>` : ''}
            </div>`;
        return itemDiv;
    }

    // Creates album cards for the share image template
    function createShareAlbumListItem(album) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'share-list-item-with-image share-album-item';
        const imageUrl = album.imageUrl || 'https://via.placeholder.com/100?text=Album';
        const titleText = album.name || 'Álbum Desconhecido';
        const subtitleText = album.artist || 'Artista Desconhecido';
        itemDiv.innerHTML = `
            <img class="share-list-item-image" src="${imageUrl}" alt="Album cover" crossorigin="anonymous">
            <div class="share-list-item-info">
                 <div class="share-list-item-title">${titleText}</div>
                 <div class="share-list-item-subtitle">${subtitleText}</div>
            </div>`;
        return itemDiv;
    }


    // Populates the hidden share image template with data
    function populateShareImageTemplate(data, user1Profile, user2Profile) {
        if (!data || !user1Profile || !user2Profile || !shareImageTemplate) return false;
        try {
            const defaultAvatar = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            shareUser1Img.src = user1Profile.imageUrl || defaultAvatar;
            shareUser2Img.src = user2Profile.imageUrl || defaultAvatar;
            shareUser1Name.textContent = user1Profile.displayName || 'Usuário 1';
            shareUser2Name.textContent = user2Profile.displayName || 'Usuário 2';
            shareCompatibilityScore.textContent = `${data.compatibilityScore || 0}%`;

            const topCommonTrack = data.commonTracks?.[0];
            if (topCommonTrack) {
                shareTrackImage.src = topCommonTrack.imageUrl || 'https://via.placeholder.com/80?text=T';
                shareTrackTitle.textContent = topCommonTrack.name || '?';
                shareTrackArtist.textContent = topCommonTrack.artists || '?';
                shareCommonTrackSection.style.display = 'flex';
            } else {
                shareCommonTrackSection.style.display = 'none';
            }

            // Set CORS for all images within template just before capture
             shareImageTemplate.querySelectorAll('img').forEach(img => {
                 img.setAttribute('crossorigin', 'anonymous');
                 img.onerror = () => { // Basic fallback on error
                     if (img.classList.contains('share-avatar')) img.src = defaultAvatar;
                     else if (img.classList.contains('share-track-image')) img.src = 'https://via.placeholder.com/80?text=T';
                     else if (img.classList.contains('share-list-item-image')) img.src = 'https://via.placeholder.com/50?text=?';
                 };
             });

            const populateList = (listElement, items, type, count, itemCreator) => {
                listElement.innerHTML = '';
                const itemsToShow = items?.slice(0, count) || [];
                if (itemsToShow.length === 0) {
                    const typeName = type === 'track' ? 'músicas' : type === 'artist' ? 'artistas' : 'álbuns';
                    listElement.innerHTML = `<div class="no-items">Nenhum ${typeName} em comum</div>`;
                } else {
                     const fragment = document.createDocumentFragment();
                    itemsToShow.forEach(item => fragment.appendChild(itemCreator(item, type)));
                     listElement.appendChild(fragment);
                }
            };
            populateList(shareTopTracksList, data.commonTracks, 'track', 5, createShareListItemWithImage);
            populateList(shareTopArtistsList, data.commonArtists, 'artist', 5, createShareListItemWithImage);
            populateList(shareTopAlbumsList, data.commonAlbums, 'album', 3, createShareAlbumListItem);

            return true;
        } catch (error) { console.error("Populate Share Img Error:", error); return false; }
    }


    // Generates and triggers download of the match image
    async function downloadMatchImage() {
        if (!matchDataCache || !user1ProfileData || !user2ProfileData) { showError('Calcule a compatibilidade primeiro.'); return; }

        downloadMatchBtn.disabled = true;
        downloadMatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        downloadMatchBtn.classList.add('btn-disabled');
        hideError();

        const populated = populateShareImageTemplate(matchDataCache, user1ProfileData, user2ProfileData);
        if (!populated) {
             showError('Falha ao preparar dados para a imagem.');
             downloadMatchBtn.disabled = false; downloadMatchBtn.innerHTML = '<i class="fas fa-download"></i> Baixar Imagem'; downloadMatchBtn.classList.remove('btn-disabled');
             return;
        }

        shareImageTemplate.style.visibility = 'visible';
        shareImageTemplate.style.height = 'auto';

        await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for images

        try {
            const canvas = await html2canvas(shareImageTemplate, {
                backgroundColor: '#121212', scale: window.devicePixelRatio * 1.5,
                useCORS: true, allowTaint: false, logging: false,
                scrollX: 0, scrollY: -window.scrollY,
                windowWidth: shareImageTemplate.scrollWidth, windowHeight: shareImageTemplate.scrollHeight
            });

            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            const user1File = (user1ProfileData.displayName || 'u1').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const user2File = (user2ProfileData.displayName || 'u2').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `spotify_match_${user1File}_${user2File}_${currentTimeRange}.png`;
            link.href = image;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            showToast('Imagem do Match baixada!');
        } catch (error) {
            console.error('html2canvas error:', error);
            showError('Não foi possível gerar a imagem. Verifique o console.');
        } finally {
            shareImageTemplate.style.visibility = 'hidden'; shareImageTemplate.style.height = '';
            downloadMatchBtn.disabled = false; downloadMatchBtn.innerHTML = '<i class="fas fa-download"></i> Baixar Imagem'; downloadMatchBtn.classList.remove('btn-disabled');
        }
    }

    // --- Event Listeners Setup ---

    loginUser1Btn.addEventListener('click', () => { if (!user1LoggedIn && !loginUser1Btn.disabled) window.location.href = '/match/login/1'; });
    loginUser2Btn.addEventListener('click', () => { if (!user2LoggedIn && !loginUser2Btn.disabled) window.location.href = '/match/login/2'; });

    timeRangeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active') || calculateMatchBtn.disabled) return;
            currentTimeRange = btn.dataset.range;
            timeRangeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (user1LoggedIn && user2LoggedIn) calculateMatch();
            else clearResults();
        });
    });

    calculateMatchBtn.addEventListener('click', calculateMatch);
    createPlaylistBtn.addEventListener('click', createSharedPlaylist);
    downloadMatchBtn.addEventListener('click', downloadMatchImage);


    // --- Main Calculation Function ---
    async function calculateMatch() {
        if (!user1LoggedIn || !user2LoggedIn || calculateMatchBtn.disabled) return;

        clearResults(); hideError();
        loadingDiv.style.display = 'block'; resultsDiv.style.display = 'block';
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

        calculateMatchBtn.disabled = true; calculateMatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...'; calculateMatchBtn.classList.add('btn-disabled');
        createPlaylistBtn.style.display = 'none'; downloadMatchBtn.style.display = 'none';
        timeRangeBtns.forEach(b => b.disabled = true);

        try {
            const response = await fetch(`/match/calculate?time_range=${currentTimeRange}&t=${Date.now()}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || `Erro ${response.status}`);

            matchDataCache = data; // Store successful results
            updateCompatibilityDisplay(data.compatibilityScore || 0);
            commonTracksCountEl.textContent = data.commonTracks?.length ?? '0';
            commonArtistsCountEl.textContent = data.commonArtists?.length ?? '0';
            commonAlbumsCountEl.textContent = data.commonAlbums?.length ?? '0';

            populateItemGrid('commonTracksList', data.commonTracks, 'track');
            populateItemGrid('commonArtistsList', data.commonArtists, 'artist');
            populateItemGrid('commonAlbumsList', data.commonAlbums, 'album');
            createGenreChart(data.topGenres);

            // Show action buttons if calculation succeeded
            createPlaylistBtn.style.display = 'inline-flex'; createPlaylistBtn.disabled = false; createPlaylistBtn.classList.remove('btn-disabled');
            downloadMatchBtn.style.display = 'inline-flex'; downloadMatchBtn.disabled = false; downloadMatchBtn.classList.remove('btn-disabled');

        } catch (error) {
            console.error('Erro ao calcular compatibilidade:', error);
            showError(error.message, error.message.includes("login") || error.message.includes("Sessão"));
            clearResults(); resultsDiv.style.display = 'none'; matchDataCache = null;
        } finally {
            loadingDiv.style.display = 'none';
            if (user1LoggedIn && user2LoggedIn) { // Re-enable only if still logged in
                 calculateMatchBtn.disabled = false; calculateMatchBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Calcular'; calculateMatchBtn.classList.remove('btn-disabled');
             } else {
                 calculateMatchBtn.innerHTML = '<i class="fas fa-lock"></i> Conecte Ambos'; // Keep disabled appearance
             }
             timeRangeBtns.forEach(b => b.disabled = false);
        }
    }

    // --- Create Shared Playlist Function ---
    async function createSharedPlaylist() {
        if (createPlaylistBtn.disabled) return;
        if (!user1LoggedIn) { showError('Usuário 1 precisa estar conectado.', true); checkAuthStatus(); return; }
        if (!matchDataCache) { showError('Calcule a compatibilidade primeiro.'); return; }

        createPlaylistBtn.disabled = true; createPlaylistBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...'; createPlaylistBtn.classList.add('btn-disabled');
        hideError();

        try {
            const response = await fetch('/match/create-playlist', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const data = await response.json();
            if (!response.ok) {
                 if (response.status === 401) { showError(data.message || 'Sessão do Usuário 1 expirada.', true); checkAuthStatus(); }
                 else { throw new Error(data.message || `Erro ${response.status}`); }
                 return;
            }

            generatedPlaylist.style.display = 'block'; playlistLink.href = data.playlistUrl;
             let statsText = `Playlist "${data.playlistName}" (${data.trackCount}) criada.`;
             if (data.recommendationsAdded) statsText += " Inclui recomendações!";
            playlistStats.textContent = statsText;
            generatedPlaylist.scrollIntoView({ behavior: 'smooth' });
            showToast('Playlist criada com sucesso!');
            createPlaylistBtn.style.display = 'none'; // Hide after success

        } catch (error) {
            console.error('Erro ao criar playlist:', error);
            showError(`Falha ao criar playlist: ${error.message}`);
            // Re-enable button on failure
            createPlaylistBtn.disabled = false; createPlaylistBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Criar Playlist'; createPlaylistBtn.classList.remove('btn-disabled');
        }
    }

    // --- Initialization ---
    initializeApp(); // Check auth status and handle errors on load

}); // End DOMContentLoaded