class TetrisInput {
  constructor(game) {
    this.game = game;
    this.keysHeld = {};
    this.repeatTimer = null;
    
    this.bindKeyboard();
    this.bindTouch();
  }

  startRepeat(fn) { 
    clearInterval(this.repeatTimer); 
    fn(); 
    this.repeatTimer = setInterval(fn, 80); 
  }
  
  stopRepeat() { 
    clearInterval(this.repeatTimer); 
  }

  bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (!this.game.state.running || this.game.state.paused) {
        if ((e.key === 'p' || e.key === 'P') && this.game.state.running) this.game.togglePause();
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); if (!this.keysHeld.left)  { this.keysHeld.left=true;  this.startRepeat(() => this.game.moveLeft());  } break;
        case 'ArrowRight': e.preventDefault(); if (!this.keysHeld.right) { this.keysHeld.right=true; this.startRepeat(() => this.game.moveRight()); } break;
        case 'ArrowDown':  e.preventDefault(); if (!this.keysHeld.down)  { this.keysHeld.down=true;  this.startRepeat(() => this.game.softDrop());  } break;
        case 'ArrowUp':    e.preventDefault(); this.game.rotateCW(); break;
        case ' ':          e.preventDefault(); this.game.hardDrop(); break;
        case 'p': case 'P': this.game.togglePause(); break;
      }
    });
    
    document.addEventListener('keyup', e => {
      if (e.key==='ArrowLeft')  { this.keysHeld.left=false;  this.stopRepeat(); }
      if (e.key==='ArrowRight') { this.keysHeld.right=false; this.stopRepeat(); }
      if (e.key==='ArrowDown')  { this.keysHeld.down=false;  this.stopRepeat(); }
    });
  }

  bindTouch() {
    if (!this.game.renderer.boardWrap) return;
    let touchStartX=0, touchStartY=0, touchLastX=0, touchMoved=false;
    const SWIPE_THRESH=20;
    
    this.game.renderer.boardWrap.addEventListener('touchstart', e => {
      const t = e.touches[0]; 
      touchStartX = touchLastX = t.clientX; 
      touchStartY = t.clientY; 
      touchMoved = false;
    }, {passive:true});
    
    this.game.renderer.boardWrap.addEventListener('touchmove', e => {
      if (!this.game.state.running || this.game.state.paused) return;
      const t = e.touches[0];
      const dx = t.clientX - touchLastX;
      if (Math.abs(dx) > SWIPE_THRESH) { 
        dx > 0 ? this.game.moveRight() : this.game.moveLeft(); 
        touchLastX = t.clientX; 
        touchMoved = true; 
      }
      if (t.clientY - touchStartY > 40) { 
        this.game.softDrop(); 
        touchStartY = t.clientY; 
        touchMoved = true; 
      }
      e.preventDefault();
    }, {passive:false});
    
    this.game.renderer.boardWrap.addEventListener('touchend', e => {
      if (!this.game.state.running || this.game.state.paused) return;
      if (!touchMoved && Math.abs(e.changedTouches[0].clientX - touchStartX) < 10) {
        this.game.rotateCW();
      }
    }, {passive:true});
  }
}
