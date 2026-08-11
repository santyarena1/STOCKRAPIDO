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
  const qDigits = clean.replace(/\D/g, '');
  const numeric = qDigits.length >= 6; // parece un código numérico (EAN/interno)

  // Parecido para ORDENAR. Para códigos no usamos word_similarity (premia el prefijo país/fabricante).
  const simTerms = numeric
    ? colDigits.map((cd) => Prisma.sql`similarity(${cd}, ${qDigits})`)
    : [
        ...colText.map((ct) => Prisma.sql`similarity(${ct}, ${clean})`),
        ...colText.map((ct) => Prisma.sql`word_similarity(${clean}, ${ct})`),
      ];
  const sim = Prisma.sql`GREATEST(${Prisma.join(simTerms, ', ')})`;

  const conds: Prisma.Sql[] = [];
  // Texto (nombre/marca/código con letras): similitud razonable.
  if (!numeric) conds.push(Prisma.sql`(${sim}) > 0.3`);
  // Códigos: exigir un TRAMO REAL compartido de dígitos, NO el prefijo de país/fabricante del EAN.
  // En EAN largos (>=12) sacamos los primeros 4 dígitos (779 país + inicio de fabricante) antes de generar n-gramas.
  const gramSource = qDigits.length >= 12 ? qDigits.slice(4) : qDigits;
  const k = gramSource.length >= 5 ? 5 : gramSource.length >= 4 ? 4 : 0;
  if (k > 0) {
    for (const gram of kgrams(gramSource, k)) {
      const like = `%${gram}%`;
      for (const cd of colDigits) conds.push(Prisma.sql`${cd} LIKE ${like}`);
    }
  }
  if (conds.length === 0) return { match: Prisma.empty, sim };
  return { match: Prisma.sql`OR (${Prisma.join(conds, ' OR ')})`, sim };
}
