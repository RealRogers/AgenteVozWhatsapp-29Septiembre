"use client";

import { useState } from "react";
import { agents } from "../data/scripts";

export function AgentsSection() {
  const [selected, setSelected] = useState(0);
  const agent = agents[selected];

  return (
    <section
      id="agentes"
      className="border-y border-[var(--lx-ln)] bg-[var(--lx-sf)]"
    >
      <div className="mx-auto max-w-[1120px] px-[22px] py-[84px]">
        <h2>Un agente para cada trabajo</h2>
        <div
          className="mt-[30px] flex flex-wrap gap-2"
          role="tablist"
          aria-label="Tipos de agente"
        >
          {agents.map((a, i) => (
            <button
              key={a.name}
              type="button"
              role="tab"
              className="lx-tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
            >
              {a.name}
            </button>
          ))}
        </div>
        <div
          className="mt-[22px] grid grid-cols-1 gap-7 rounded border border-[var(--lx-ln)] bg-[var(--lx-sf)] p-7 min-[761px]:grid-cols-2"
          role="tabpanel"
        >
          <div>
            <h3>{agent.name}</h3>
            <p className="mt-2 text-[var(--lx-mu)]">{agent.description}</p>
          </div>
          <ul className="m-0 pl-[18px] text-[var(--lx-mu)]">
            {agent.bullets.map((b) => (
              <li key={b} className="my-1.5">
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
