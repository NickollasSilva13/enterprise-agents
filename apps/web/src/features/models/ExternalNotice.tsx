import { TriangleAlert } from 'lucide-react';

interface ExternalNoticeProps {
  /** A harness runs here but answers through its vendor's service. */
  readonly harness?: boolean;
}

/** Says exactly what leaves this computer when an external provider is used (RF-44). */
export function ExternalNotice({ harness = false }: ExternalNoticeProps) {
  return (
    <div className="flex gap-2.5 rounded-md border border-wait/60 bg-wait/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-wait" aria-hidden />
      <p>
        {harness
          ? 'O programa do harness roda neste computador, mas responde pelo serviço dele. Quando um agente usa um modelo deste provedor, são enviados a esse serviço o prompt de sistema, o histórico da conversa e os resultados das ferramentas desse agente.'
          : 'Este provedor fica fora deste computador. Quando um agente usa um modelo dele, são enviados ao provedor o prompt de sistema, o histórico da conversa e os resultados das ferramentas desse agente.'}
      </p>
    </div>
  );
}
