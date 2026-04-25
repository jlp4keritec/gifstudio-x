import cron from 'node-cron';
// parser expose via node-cron en types internes ; on utilise cron-parser
// mais pour eviter une dep de plus on va juste valider la syntaxe + la frequence
// via l'analyse du champ "minutes".

/**
 * Verifie la validite syntaxique + la frequence min (15 min).
 * Accepte les 5 champs (min h dom mon dow).
 * Rejette si la premiere partie autorise un declenchement plus frequent que toutes les 15 min.
 *
 * Regle : on inspecte le champ minutes
 *   - "*"              -> rejete (chaque minute)
 *   - "*\/N" (step)    -> rejete si N < 15
 *   - liste "0,5,10"   -> rejete si un ecart < 15
 *   - plage "0-30/5"   -> step verifie
 *   - valeur unique    -> ok (ne s'execute qu'une fois / h)
 */
export function validateCronMinInterval(expression: string): {
  valid: boolean;
  error?: string;
} {
  if (!cron.validate(expression)) {
    return { valid: false, error: 'Syntaxe cron invalide' };
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) {
    return { valid: false, error: 'Cron doit avoir au moins 5 champs' };
  }
  const minutes = parts[0];

  // Cas "*" seul = toutes les minutes
  if (minutes === '*') {
    return {
      valid: false,
      error: 'Frequence trop elevee (min 15 min entre runs)',
    };
  }

  // Extraire les valeurs possibles sur [0..59]
  const expanded = expandMinutesField(minutes);
  if (expanded === null) {
    return { valid: false, error: 'Champ minutes invalide' };
  }

  // Si une seule valeur ou zero, c'est forcement >= 1h donc OK
  if (expanded.length <= 1) return { valid: true };

  // Sinon, verifier qu'entre chaque valeur consecutive il y a >= 15 min
  const sorted = [...expanded].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < 15) {
      return {
        valid: false,
        error: `Intervalle trop court entre minute ${sorted[i - 1]} et ${sorted[i]} (min 15 min)`,
      };
    }
  }
  // Verifier aussi le wrap-around (ex: 55 puis 0 de l'heure suivante = 5 min)
  const wrap = 60 - sorted[sorted.length - 1] + sorted[0];
  if (wrap < 15) {
    return {
      valid: false,
      error: `Intervalle trop court entre minute ${sorted[sorted.length - 1]} et ${sorted[0]} (min 15 min)`,
    };
  }

  return { valid: true };
}

function expandMinutesField(field: string): number[] | null {
  try {
    const values = new Set<number>();
    const parts = field.split(',');
    for (const part of parts) {
      const stepMatch = part.match(/^(\*|\d+(-\d+)?)\/(\d+)$/);
      if (stepMatch) {
        const range = stepMatch[1];
        const step = Number(stepMatch[3]);
        if (step < 1) return null;
        const [start, end] =
          range === '*'
            ? [0, 59]
            : range.includes('-')
              ? range.split('-').map(Number)
              : [Number(range), 59];
        for (let i = start; i <= end; i += step) values.add(i);
        continue;
      }
      if (part.includes('-')) {
        const [s, e] = part.split('-').map(Number);
        for (let i = s; i <= e; i++) values.add(i);
        continue;
      }
      const n = Number(part);
      if (Number.isNaN(n)) return null;
      values.add(n);
    }
    return Array.from(values);
  } catch {
    return null;
  }
}
