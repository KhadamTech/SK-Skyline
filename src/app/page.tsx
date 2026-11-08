
import GameCanvas from '../components/GameCanvas';

export default function Home() {
  return (
    <main className="w-screen h-screen m-0 p-0 overflow-hidden">
      <GameCanvas />

      <footer className="game-footer">
        Build your city. Shape your skyline.
      </footer>
    </main>
  );
}
