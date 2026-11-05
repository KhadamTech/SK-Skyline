import GameCanvas from '../components/GameCanvas';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8 text-white">SK Skyline</h1>
      <GameCanvas />
    </main>
  );
}
