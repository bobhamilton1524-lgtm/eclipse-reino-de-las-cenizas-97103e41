import { createFileRoute } from "@tanstack/react-router";
import { GameScreen } from "@/components/game/GameScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ECLIPSE: Reino de las Cenizas — RPG de acción pixel art" },
      {
        name: "description",
        content:
          "Explora Umbravía y desciende a la cripta como Guerrero en este RPG 2D de acción de fantasía oscura en pixel art.",
      },
      { property: "og:title", content: "ECLIPSE: Reino de las Cenizas" },
      {
        property: "og:description",
        content: "RPG 2D de acción de fantasía oscura: la ciudad de Umbravía, la cripta y combate cuerpo a cuerpo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <GameScreen />;
}
