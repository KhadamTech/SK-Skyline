
import GameCanvas from '../components/GameCanvas';

export default function Home() {
  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand">
          <span className="brand-mark">SK</span>
          <span>SK SKYLINE</span>
        </div>
        <span className="edition">CITY BUILDER</span>
      </header>

      <GameCanvas />

      <footer className="game-footer">
        Build your city. Shape your skyline.
      </footer>
    </main>
  );
}
