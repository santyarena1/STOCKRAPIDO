import { Prisma } from '@prisma/client';

/** Genera los n-gramas únicos de longitud k de una cadena. */
function kgrams(value: string, k: number): string[] {
  const set = new Set<string>();
  for (let i = 0; i + k <= value.length; i += 1) set.add(value.slice(i, i + k));
  return [...set];
}

/**
 * Cláusula SQL de coincidencia aproximada por código.
 * Matchea cuando comparte una parte con el término buscado, aunque ninguno contenga al otro:
 *  - similitud por trigramas (pg_trgm) sobre el texto de los códigos
 *  - fragmentos de dígitos compartidos: genera los n-gramas de 5 (o 4) dígitos del término
 *    y matchea cualquier código cuyos dígitos contengan alguno.
 * Ej.: barcode 7790040659605 y ref ARC-1006596 comparten "06596".
 *
 * Devuelve { match, sim }: `match` va con OR dentro del WHERE; `sim` sirve para ordenar por parecido.
 * Solo se activa con 1 token de >=3 caracteres (búsqueda de un código).
 */
export function fuzzyCodeClause(
  term: string,
  tokens: string[],
  alias: string,
  cols: string[],
): { match: Prisma.Sql; sim: Prisma.Sql } {
  const clean = term.trim();
  if (tokens.length !== 1 || clean.length < 3 || cols.length === 0) {
    return { match: Prisma.empty, sim: Prisma.sql`0` };
  }
  const colText = cols.map((c) => Prisma.sql`COALESCE(${Prisma.raw(`${alias}."${c}"`)}, '')`);
  const colDigits = cols.map((c) => Prisma.sql`regexp_replace(COALESCE(${Prisma.raw(`${alias}."${c}"`)}, ''), '[^0-9]', '', 'g')`);
  // Parecido para ORDENAR: combina similitud global y de subcadena (word_similarity), sobre texto y dígitos.
  const qDigits = clean.replace(/\D/g, '');
  const simTerms = [
    ...colText.map((ct) => Prisma.sql`similarity(${ct}, ${clean})`),
    ...colText.map((ct) => Prisma.sql`word_similarity(${clean}, ${ct})`),
    ...(qDigits.length >= 4 ? colDigits.map((cd) => Prisma.sql`word_similarity(${qDigits}, ${cd})`) : []),
  ];
  const sim = Prisma.sql`GREATEST(${Prisma.join(simTerms, ', ')})`;

  // MATCH: parecido de texto razonable O comparten CUALQUIER tramo de 4 dígitos (cubre solapes de largo/posición variable).
  const conds: Prisma.Sql[] = [Prisma.sql`(${sim}) > 0.25`];
  if (qDigits.length >= 4) {
    for (const gram of kgrams(qDigits, 4)) {
      const like = `%${gram}%`;
      for (const cd of colDigits) conds.push(Prisma.sql`${cd} LIKE ${like}`);
    }
  }
  return { match: Prisma.sql`OR (${Prisma.join(conds, ' OR ')})`, sim };
}
