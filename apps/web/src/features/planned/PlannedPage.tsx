import type { PlannedArea } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';

/** Stands in for an area that is designed but not built yet (RNF-12). */
export function PlannedPage({ area }: { area: PlannedArea }) {
  return (
    <>
      <PageHeader title={area.title} description={area.summary} />
      <section className="max-w-2xl rounded-lg border border-dashed border-line-strong p-5">
        <h2 className="text-lg font-semibold">Planejado para a Fase {area.phase}</h2>
        <p className="mt-1 text-dim">
          Esta área ainda não funciona. Quando for entregue, aqui será possível:
        </p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5">
          {area.capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
