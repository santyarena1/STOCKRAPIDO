export * from '../../../../shared/plans';

export function formatPlanPrice(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function yearlyEquivalentMonthly(plan: { yearlyPrice: number }): number {
  return Math.round(plan.yearlyPrice / 12);
}
