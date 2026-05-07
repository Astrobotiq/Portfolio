document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById('tetrisBoard')) {
    window.tetrisGame = new TetrisGame();
  }
});
