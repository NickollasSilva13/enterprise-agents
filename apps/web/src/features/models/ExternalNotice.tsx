import { TriangleAlert } from 'lucide-react';

/** Says exactly what leaves this computer when an external provider is used (RF-44). */
export function ExternalNotice() {
  return (
    <div className="flex gap-2.5 rounded-md border border-wait/60 bg-wait/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-wait" aria-hidden />
      <p>
        Este provedor fica fora deste computador. Quando um agente usa um modelo dele, são enviados
        ao provedor o prompt de sistema, o histórico da conversa e os resultados das ferramentas
        desse agente.
      </p>
    </div>
  );
}
