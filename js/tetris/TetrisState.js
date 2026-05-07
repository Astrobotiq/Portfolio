class TetrisState {
  constructor() {
    this.reset();
  }

  reset() {
    this.grid = Array(TetrisConstants.ROWS).fill(null).map(() => Array(TetrisConstants.COLS).fill(null));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.comboCount = 0;
    this.running = false;
    this.paused = false;
    this.isLocking = false;
    
    this.cur = null;
    this.curKey = null;
    this.rot = 0;
    this.curRow = 0;
    this.curCol = 0;
    this.nextKey = this.randKey();
  }

  randKey() {
    return TetrisConstants.PIECE_KEYS[Math.floor(Math.random() * TetrisConstants.PIECE_KEYS.length)];
  }

  spawnPiece(key) {
    this.curKey = key; 
    this.rot = 0;
    this.cur = TetrisConstants.PIECES[this.curKey][this.rot];
    this.curRow = 0;
    this.curCol = Math.floor((TetrisConstants.COLS - this.cur[0].length) / 2);
  }

  canPlace(piece, row, col) {
    for (let r = 0; r < piece.length; r++) {
      for (let c = 0; c < piece[r].length; c++) {
        if (piece[r][c]) {
          const nr = row + r;
          const nc = col + c;
          if (nr < 0 || nr >= TetrisConstants.ROWS || nc < 0 || nc >= TetrisConstants.COLS || this.grid[nr][nc]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  ghostRow() {
    let gr = this.curRow;
    while (this.canPlace(this.cur, gr + 1, this.curCol)) {
      gr++;
    }
    return gr;
  }

  getFullRows() {
    const fullRows = [];
    for (let r = 0; r < TetrisConstants.ROWS; r++) {
      if (this.grid[r].every(c => c !== null)) {
        fullRows.push(r);
      }
    }
    return fullRows;
  }
}
