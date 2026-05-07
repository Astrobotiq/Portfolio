class TetrisRenderer {
  constructor() {
    this.boardEl = document.getElementById('tetrisBoard');
    this.boardWrap = document.querySelector('.tetris-board-wrap');
    this.scoreEl = document.getElementById('scoreDisplay');
    this.linesEl = document.getElementById('linesDisplay');
    this.levelEl = document.getElementById('levelDisplay');
    this.nextGrid = document.getElementById('nextPieceGrid');
    this.pCanvas = document.getElementById('particle-canvas');
    this.pCtx = this.pCanvas ? this.pCanvas.getContext('2d') : null;
    
    this.cells = [];
    this.npCells = [];
    this.particles = [];

    this.initDOM();
    if (this.pCanvas) {
      window.addEventListener('resize', () => this.resizeParticleCanvas());
      setTimeout(() => this.resizeParticleCanvas(), 100);
      setInterval(() => this.tickParticles(), 16);
    }
  }

  initDOM() {
    if (!this.boardEl || !this.nextGrid) return;
    this.boardEl.innerHTML = '';
    this.nextGrid.innerHTML = '';
    for (let r = 0; r < TetrisConstants.ROWS; r++) {
      for (let c = 0; c < TetrisConstants.COLS; c++) {
        const d = document.createElement('div');
        d.className = 'tb-cell';
        this.boardEl.appendChild(d);
        this.cells.push(d);
      }
    }
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div');
      d.className = 'np-cell';
      this.nextGrid.appendChild(d);
      this.npCells.push(d);
    }
  }

  resizeParticleCanvas() {
    if (!this.pCanvas || !this.boardEl) return;
    this.pCanvas.width  = this.boardEl.offsetWidth  + 6;
    this.pCanvas.height = this.boardEl.offsetHeight + 6;
  }

  spawnRowParticles(rowIndex, color) {
    if (!this.pCanvas) return;
    this.resizeParticleCanvas();
    const cellW = this.pCanvas.width / TetrisConstants.COLS;
    const cellH = this.pCanvas.height / TetrisConstants.ROWS;
    const y = rowIndex * cellH + cellH / 2;
    for (let c = 0; c < TetrisConstants.COLS; c++) {
      const x = c * cellW + cellW / 2;
      const count = 6;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.8;
        const speed = 2 + Math.random() * 4;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 1.0,
          decay: 0.03 + Math.random() * 0.04,
          size: 3 + Math.random() * 4,
          color,
        });
      }
    }
  }

  tickParticles() {
    if (!this.pCtx) return;
    this.pCtx.clearRect(0, 0, this.pCanvas.width, this.pCanvas.height);
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.18; // gravity
      p.vx *= 0.97;
      p.life -= p.decay;
      this.pCtx.globalAlpha = Math.max(0, p.life);
      this.pCtx.fillStyle = p.color;
      const s = p.size * p.life;
      this.pCtx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }
    this.pCtx.globalAlpha = 1;
  }

  shakeBoard() {
    if (!this.boardWrap) return;
    this.boardWrap.classList.remove('shake');
    void this.boardWrap.offsetWidth; // reflow
    this.boardWrap.classList.add('shake');
    this.boardWrap.addEventListener('animationend', () => this.boardWrap.classList.remove('shake'), {once:true});
  }

  popScore() {
    if (!this.scoreEl) return;
    this.scoreEl.classList.remove('pop');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('pop');
    this.scoreEl.addEventListener('animationend', () => this.scoreEl.classList.remove('pop'), {once:true});
  }

  showFloatingText(text, yRowHint) {
    if (!this.boardWrap) return;
    const el = document.createElement('div');
    el.className = 'score-float';
    el.textContent = text;
    const topPct = Math.max(5, Math.min(80, (yRowHint / TetrisConstants.ROWS) * 100));
    el.style.top = topPct + '%';
    this.boardWrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  animateClearRows(rowIndices, color) {
    return new Promise(resolve => {
      rowIndices.forEach(r => {
        for (let c = 0; c < TetrisConstants.COLS; c++) {
          const cell = this.cells[r * TetrisConstants.COLS + c];
          cell.style.setProperty('--flash-color', color);
          cell.classList.add('clearing');
        }
        this.spawnRowParticles(r, color);
      });
      setTimeout(() => {
        rowIndices.forEach(r => {
          for (let c = 0; c < TetrisConstants.COLS; c++) {
            const cell = this.cells[r * TetrisConstants.COLS + c];
            cell.classList.remove('clearing');
            cell.style.animation = 'none';
          }
        });
        resolve();
      }, 380);
    });
  }

  styleCell(cell, color, cls) {
    cell.className = `tb-cell ${cls}`;
    cell.style.background = color;
    cell.style.borderColor = color;
    cell.style.boxShadow = `inset 3px 3px 0 rgba(255,255,255,0.25), inset -3px -3px 0 rgba(0,0,0,0.4), 0 0 6px ${color}66`;
  }

  renderNext(nextKey) {
    if (!this.nextGrid) return;
    this.npCells.forEach(c => { c.className = 'np-cell'; c.style.cssText = ''; });
    const shape = TetrisConstants.PIECES[nextKey][0];
    const color = TetrisConstants.COLORS[nextKey];
    const rowOff = Math.floor((4 - shape.length) / 2);
    const colOff = Math.floor((4 - shape[0].length) / 2);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const idx = (rowOff + r) * 4 + (colOff + c);
          this.npCells[idx].className = 'np-cell filled';
          this.npCells[idx].style.background = color;
          this.npCells[idx].style.borderColor = color;
          this.npCells[idx].style.boxShadow = `inset 2px 2px 0 rgba(255,255,255,0.2), inset -2px -2px 0 rgba(0,0,0,0.35)`;
        }
      }
    }
  }

  updateHUD(score, lines, level) {
    if (this.scoreEl) this.scoreEl.textContent = String(score).padStart(6,'0');
    if (this.linesEl) this.linesEl.textContent = lines;
    if (this.levelEl) this.levelEl.textContent = level;
  }

  renderBoard(state) {
    const ghost = state.ghostRow();
    for (let r = 0; r < TetrisConstants.ROWS; r++) {
      for (let c = 0; c < TetrisConstants.COLS; c++) {
        const cell = this.cells[r * TetrisConstants.COLS + c];
        if (cell.classList.contains('clearing')) continue;
        const locked = state.grid[r][c];
        if (locked) { 
          this.styleCell(cell, locked, 'filled'); 
        } else { 
          cell.className = 'tb-cell'; 
          cell.style.background = ''; 
          cell.style.borderColor = ''; 
          cell.style.boxShadow = ''; 
        }
      }
    }
    // Ghost
    if (state.cur) {
      for (let r = 0; r < state.cur.length; r++) {
        for (let c = 0; c < state.cur[r].length; c++) {
          if (state.cur[r][c]) {
            const nr = ghost + r, nc = state.curCol + c;
            if (nr >= 0 && nr < TetrisConstants.ROWS) {
              const cell = this.cells[nr * TetrisConstants.COLS + nc];
              if (!state.grid[nr][nc] && !cell.classList.contains('clearing')) {
                cell.className = 'tb-cell ghost filled';
                cell.style.background = TetrisConstants.COLORS[state.curKey];
                cell.style.borderColor = TetrisConstants.COLORS[state.curKey];
                cell.style.boxShadow = '';
              }
            }
          }
        }
      }
      // Active piece
      for (let r = 0; r < state.cur.length; r++) {
        for (let c = 0; c < state.cur[r].length; c++) {
          if (state.cur[r][c]) {
            const nr = state.curRow + r, nc = state.curCol + c;
            if (nr >= 0 && nr < TetrisConstants.ROWS && !this.cells[nr*TetrisConstants.COLS+nc].classList.contains('clearing')) {
              this.styleCell(this.cells[nr * TetrisConstants.COLS + nc], TetrisConstants.COLORS[state.curKey], 'filled');
            }
          }
        }
      }
    }
  }
}
