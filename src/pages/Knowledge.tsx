import { BookOpen } from "lucide-react";

export default function Knowledge() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
      <BookOpen className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm">Base de Conhecimento em breve</p>
    </div>
  );
}
