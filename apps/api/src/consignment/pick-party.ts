export function pickConsignmentParty(
  parties: { id: string }[],
  requestedId?: string | null,
): { ok: true; partyId: string } | { ok: false; message: string } {
  const requested = requestedId?.trim() || '';
  if (requested) {
    if (!parties.some((party) => party.id === requested)) {
      return { ok: false, message: 'Entidad inválida.' };
    }
    return { ok: true, partyId: requested };
  }
  if (parties.length === 1) return { ok: true, partyId: parties[0].id };
  if (parties.length === 0) {
    return { ok: false, message: 'Primero creá una entidad en Comisionados.' };
  }
  return { ok: false, message: 'Elegí a quién asociar el producto comisionado.' };
}

export function quickProductFlags(input: { silent?: boolean }) {
  return {
    stockControl: false as const,
    incomplete: true as const,
    silent: Boolean(input.silent),
  };
}
