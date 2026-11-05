const EDAD_MAXIMA = 120;

export const limpiarDni = (dni: unknown) => String(dni ?? '').replace(/\D/g, '');

export const esDniValido = (dni: unknown) => /^\d{7,8}$/.test(limpiarDni(dni));

export const ERROR_DNI = 'El DNI debe tener 7 u 8 números';

export function errorFechaNacimiento(fecha: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(fecha ?? '').trim());
  if (!m) return 'La fecha de nacimiento debe tener el formato DD/MM/AAAA';

  const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(anio, mes - 1, dia);
  const existe =
    date.getFullYear() === anio && date.getMonth() === mes - 1 && date.getDate() === dia;
  if (!existe) return 'La fecha de nacimiento no existe';

  const hoy = new Date();
  if (date > hoy) return 'La fecha de nacimiento no puede ser futura';
  if (hoy.getFullYear() - anio > EDAD_MAXIMA) return 'Revisá el año de nacimiento';
  return null;
}
