class TetrisGame {
  constructor() {
    this.state = new TetrisState();
    this.renderer = new TetrisRenderer();
    this.leaderboard = new TetrisLeaderboard();
    this.input = new TetrisInput(this);
    
    this.dropTimer = null;
    this.bindOverlay();
    
    // Background blocks
    this.initBackground();
  }

  bindOverlay() {
    this.overlay = document.getElementById('tetrisOverlay');
    this.overlayBtn = document.getElementById('overlayBtn');
    this.overlayTitle = document.getElementById('overlayTitle');
    this.overlaySub = document.getElementById('overlaySub');
    this.nameRow = document.getElementById('nameRow');
    this.nameInput = document.getElementById('playerNameInput');

    if (this.overlayBtn) {
      this.overlayBtn.addEventListener('click', () => {
        if (this.state.running && this.state.paused) { this.togglePause(); return; }
        if (!this.state.running && this.nameRow.style.display !== 'none') {
          this.leaderboard.addScore(this.nameInput.value || 'AAA', this.state.score, this.state.lines);
        }
        this.startGame();
      });
    }

    if (this.nameInput) {
      this.nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.overlayBtn.click();
      });
    }

    if (this.overlayTitle) this.overlayTitle.textContent = 'TETRIS';
    if (this.overlaySub) this.overlaySub.textContent = 'Click START or press any arrow key';
    if (this.overlayBtn) this.overlayBtn.textContent = '▶ START GAME';
    if (this.nameRow) this.nameRow.style.display = 'none';

    document.addEventListener('keydown', (e) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key) && !this.state.running) {
        this.startGame();
      }
    }, {once: true});
  }

  startGame() {
    this.state.reset();
    this.state.nextKey = this.state.randKey();
    this.renderer.renderNext(this.state.nextKey);
    this.state.spawnPiece(this.state.randKey());
    this.state.running = true;
    this.state.paused = false;
    
    if (this.overlay) this.overlay.classList.add('hidden');
    if (this.nameRow) this.nameRow.style.display = 'none';
    
    this.scheduleGravity();
    this.renderer.renderBoard(this.state);
    this.renderer.updateHUD(this.state.score, this.state.lines, this.state.level);
    this.renderer.resizeParticleCanvas();
  }

  gameOver() {
    this.state.running = false;
    clearTimeout(this.dropTimer);
    if (this.overlayTitle) this.overlayTitle.textContent = 'GAME OVER';
    if (this.overlaySub) this.overlaySub.textContent = `SCORE: ${String(this.state.score).padStart(6,'0')} · LINES: ${this.state.lines}`;
    if (this.nameRow) this.nameRow.style.display = 'flex';
    if (this.nameInput) this.nameInput.value = '';
    if (this.overlayBtn) this.overlayBtn.textContent = '▶ SAVE & PLAY AGAIN';
    if (this.overlay) this.overlay.classList.remove('hidden');
    if (this.nameInput) setTimeout(()=>this.nameInput.focus(), 50);
  }

  togglePause() {
    if (!this.state.running) return;
    this.state.paused = !this.state.paused;
    if (!this.state.paused) { 
      if (this.overlay) this.overlay.classList.add('hidden'); 
      this.scheduleGravity(); 
    } else {
      clearTimeout(this.dropTimer);
      if (this.overlayTitle) this.overlayTitle.textContent='PAUSED'; 
      if (this.overlaySub) this.overlaySub.textContent='PRESS P TO RESUME';
      if (this.nameRow) this.nameRow.style.display='none'; 
      if (this.overlayBtn) this.overlayBtn.textContent='▶ RESUME';
      if (this.overlay) this.overlay.classList.remove('hidden');
    }
  }

  scheduleGravity() {
    clearTimeout(this.dropTimer);
    const speed = TetrisConstants.LEVEL_SPEED[Math.min(this.state.level - 1, TetrisConstants.LEVEL_SPEED.length - 1)];
    this.dropTimer = setTimeout(() => this.gravityTick(), speed);
  }

  gravityTick() {
    if (!this.state.running || this.state.paused || this.state.isLocking) return;
    if (this.state.canPlace(this.state.cur, this.state.curRow + 1, this.state.curCol)) {
      this.state.curRow++; 
      this.renderer.renderBoard(this.state); 
      this.scheduleGravity();
    } else { 
      this.lock(); 
    }
  }

  async lock() {
    if (this.state.isLocking) return; 
    this.state.isLocking = true;
    clearTimeout(this.dropTimer);
    
    // Commit to grid
    for (let r = 0; r < this.state.cur.length; r++) {
      for (let c = 0; c < this.state.cur[r].length; c++) {
        if (this.state.cur[r][c]) {
          this.state.grid[this.state.curRow + r][this.state.curCol + c] = TetrisConstants.COLORS[this.state.curKey];
        }
      }
    }

    const fullRows = this.state.getFullRows();

    if (fullRows.length > 0) {
      const flashColor = this.state.grid[fullRows[0]][Math.floor(TetrisConstants.COLS/2)] || TetrisConstants.COLORS[this.state.curKey];
      this.renderer.renderBoard(this.state); 
      await this.renderer.animateClearRows(fullRows, flashColor);

      for (const r of [...fullRows].sort((a,b)=>b-a)) {
        this.state.grid.splice(r, 1);
      }
      const cleared = fullRows.length;
      for (let i = 0; i < cleared; i++) {
        this.state.grid.unshift(Array(TetrisConstants.COLS).fill(null));
      }
      
      this.state.lines += cleared;
      this.state.comboCount++;
      const base = TetrisConstants.LINE_SCORES[cleared] * this.state.level;
      const combo = this.state.comboCount > 1 ? Math.floor(base * 0.5 * (this.state.comboCount - 1)) : 0;
      this.state.score += base + combo;
      this.state.level = Math.min(10, Math.floor(this.state.lines / 10) + 1);

      this.renderer.shakeBoard();
      this.renderer.popScore();
      const label = TetrisConstants.CLEAR_LABELS[cleared] + (this.state.comboCount > 1 ? ` x${this.state.comboCount}` : '');
      this.renderer.showFloatingText(label, fullRows[0]);
      this.renderer.updateHUD(this.state.score, this.state.lines, this.state.level);
    } else {
      this.state.comboCount = 0;
    }

    const nk = this.state.nextKey;
    this.state.nextKey = this.state.randKey();
    this.renderer.renderNext(this.state.nextKey);
    this.state.spawnPiece(nk);
    
    if (!this.state.canPlace(this.state.cur, this.state.curRow, this.state.curCol)) { 
      this.state.isLocking = false; 
      this.gameOver(); 
      return; 
    }
    
    this.scheduleGravity();
    this.renderer.renderBoard(this.state);
    this.state.isLocking = false;
  }

  moveLeft() { 
    if (this.state.isLocking) return; 
    if (this.state.canPlace(this.state.cur, this.state.curRow, this.state.curCol - 1)) { 
      this.state.curCol--; 
      this.renderer.renderBoard(this.state); 
    } 
  }
  
  moveRight() { 
    if (this.state.isLocking) return; 
    if (this.state.canPlace(this.state.cur, this.state.curRow, this.state.curCol + 1)) { 
      this.state.curCol++; 
      this.renderer.renderBoard(this.state); 
    } 
  }

  rotateCW() {
    if (this.state.isLocking) return;
    const nextRot = (this.state.rot + 1) % TetrisConstants.PIECES[this.state.curKey].length;
    const next = TetrisConstants.PIECES[this.state.curKey][nextRot];
    for (const [dr, dc] of [[0,0],[0,-1],[0,1],[0,-2],[0,2],[-1,0]]) {
      if (this.state.canPlace(next, this.state.curRow + dr, this.state.curCol + dc)) {
        this.state.rot = nextRot; 
        this.state.cur = next; 
        this.state.curRow += dr; 
        this.state.curCol += dc;
        this.renderer.renderBoard(this.state); 
        return;
      }
    }
  }

  softDrop() {
    if (this.state.isLocking) return;
    if (this.state.canPlace(this.state.cur, this.state.curRow + 1, this.state.curCol)) {
      this.state.curRow++; 
      this.state.score += 1; 
      this.renderer.updateHUD(this.state.score, this.state.lines, this.state.level); 
      this.renderer.renderBoard(this.state); 
      this.scheduleGravity();
    } else { 
      this.lock(); 
    }
  }

  hardDrop() {
    if (this.state.isLocking) return;
    const gr = this.state.ghostRow();
    this.state.score += (gr - this.state.curRow) * 2; 
    this.state.curRow = gr;
    this.renderer.updateHUD(this.state.score, this.state.lines, this.state.level); 
    this.renderer.renderBoard(this.state); 
    this.lock();
  }

  // Falling Blocks Background
  initBackground() {
    const canvas = document.getElementById('tetris-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const BG_COLORS = ['#00f0f0','#f0f000','#a000f0','#00f000','#f00000','#0000f0','#f0a000'];
    
    function resizeCanvas() { 
      canvas.width = window.innerWidth; 
      canvas.height = window.innerHeight; 
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const bgBlocks = Array(30).fill(null).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight - window.innerHeight,
      size: Math.floor(Math.random() * 3 + 1) * 20,
      color: BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)],
      speed: Math.random() * 0.8 + 0.3,
    }));

    function drawBgBlocks() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bgBlocks.forEach(b => {
        b.y += b.speed;
        if (b.y > canvas.height + 100) {
          b.y = -100;
          b.x = Math.random() * canvas.width;
          b.color = BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
        }
        ctx.save();
        ctx.translate(b.x + b.size/2, b.y + b.size/2);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.size/2, -b.size/2, b.size, b.size);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(-b.size/2, -b.size/2, b.size/2, b.size/2);
        ctx.restore();
      });
    }
    setInterval(drawBgBlocks, 40);
  }
}
