import { TriangleAlert } from 'lucide-react';
import { Notice } from '../../components/Notice';

interface ExternalNoticeProps {
  /** A harness runs here but answers through its vendor's service. */
  readonly harness?: boolean;
}

/** Says exactly what leaves this computer when an external provider is used (RF-44). */
export function ExternalNotice({ harness = false }: ExternalNoticeProps) {
  return (
    <Notice tone="wait" icon={<TriangleAlert className="size-4.5" aria-hidden />}>
      <p>
        {harness
          ? 'O programa do harness roda neste computador, mas responde pelo serviço dele. Quando um agente usa um modelo deste provedor, são enviados a esse serviço o prompt de sistema, o histórico da conversa e os resultados das ferramentas desse agente.'
          : 'Este provedor fica fora deste computador. Quando um agente usa um modelo dele, são enviados ao provedor o prompt de sistema, o histórico da conversa e os resultados das ferramentas desse agente.'}
      </p>
    </Notice>
  );
}
