export type OnboardingState = {
  completedSteps: string[];
  skippedSteps: string[];
  tourVersion: number;
  finishedAt: string | null;
  dismissedChecklist?: boolean;
  pending?: string[];
  totalSteps?: number;
};

export const ONBOARDING_STEPS = [
  { id: 'brand', title: 'Tu kiosco', desc: 'Nombre, logo y colores' },
  { id: 'categories', title: 'Categorías', desc: 'Organizá tu inventario' },
  { id: 'first_product', title: 'Primer producto', desc: 'Cargá algo para vender' },
  { id: 'open_caja', title: 'Abrir caja', desc: 'Monto inicial del turno' },
  { id: 'first_sale', title: 'Primera venta', desc: 'Probá el POS' },
] as const;

export function onboardingProgress(state: OnboardingState | null | undefined) {
  if (!state) return { done: 0, total: ONBOARDING_STEPS.length };
  const done = ONBOARDING_STEPS.filter(
    (s) => state.completedSteps.includes(s.id) || state.skippedSteps.includes(s.id),
  ).length;
  return { done, total: ONBOARDING_STEPS.length };
}
