import { integrations } from "../data/scripts";

/** Franja de integraciones bajo el hero. */
export function IntegrationsStrip() {
  return (
    <div className="border-y border-[var(--lx-ln)] py-[22px]">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-7 gap-y-2.5 px-[22px] text-[0.95rem] text-[var(--lx-mu)]">
        <b className="font-semibold text-[var(--lx-tx)]">Se conecta con</b>
        {integrations.map((i) => (
          <span key={i}>{i}</span>
        ))}
      </div>
    </div>
  );
}
