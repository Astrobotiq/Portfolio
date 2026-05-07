class TetrisLeaderboard {
  constructor() {
    this.LS_KEY = 'tetris_lb_v1';
    this.SESSION_SCORES = [];
    this.MEDALS = ['gold','silver','bronze'];
    this.lbAllTime = document.getElementById('lbAllTime');
    this.lbSession = document.getElementById('lbSession');
    
    // Bind tabs if they exist
    window.switchLbTab = (tab) => this.switchTab(tab);
    
    this.renderLeaderboard();
  }

  loadAllTime() {
    try { return JSON.parse(localStorage.getItem(this.LS_KEY)) || []; }
    catch { return []; }
  }

  saveAllTime(arr) {
    try { localStorage.setItem(this.LS_KEY, JSON.stringify(arr.slice(0,10))); } catch {}
  }

  addScore(name, sc, ln) {
    const entry = { name: (name||'???').toUpperCase().slice(0,8), score:sc, lines:ln, date: new Date().toLocaleDateString() };
    this.SESSION_SCORES.unshift(entry);
    this.SESSION_SCORES.sort((a,b)=>b.score-a.score);

    const all = this.loadAllTime();
    all.push(entry);
    all.sort((a,b)=>b.score-a.score);
    this.saveAllTime(all);

    this.renderLeaderboard();
  }

  renderBoard(listEl, entries, highlightName) {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!entries.length) {
      listEl.innerHTML = '<div class="lb-empty-msg">no scores yet</div>';
      return;
    }
    entries.slice(0,8).forEach((e,i) => {
      const row = document.createElement('div');
      const isYou = highlightName && e.name === highlightName.toUpperCase().slice(0,8);
      row.className = 'lb-entry' + (i<3?' '+this.MEDALS[i]:'') + (isYou?' you':'');
      row.style.animationDelay = (i*0.04)+'s';
      row.innerHTML =
        `<span class="lb-entry-rank">${i+1}</span>` +
        `<span class="lb-entry-name">${e.name}</span>` +
        `<span class="lb-entry-score">${String(e.score).padStart(6,'0')}</span>`;
      listEl.appendChild(row);
    });
  }

  renderLeaderboard(highlightName) {
    this.renderBoard(this.lbAllTime, this.loadAllTime(), highlightName);
    this.renderBoard(this.lbSession, this.SESSION_SCORES, highlightName);
  }

  switchTab(tab) {
    if (this.lbAllTime) this.lbAllTime.style.display = tab==='all' ? '' : 'none';
    if (this.lbSession) this.lbSession.style.display = tab==='session' ? '' : 'none';
    const tA = document.getElementById('tabAll');
    const tS = document.getElementById('tabSession');
    if (tA) tA.classList.toggle('active', tab==='all');
    if (tS) tS.classList.toggle('active', tab==='session');
  }
}
