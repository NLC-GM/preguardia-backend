import bcrypt from 'bcryptjs';

const RONDAS = 10;

const esHashBcrypt = (valor: string) => /^\$2[aby]\$\d{2}\$/.test(valor);

export function hashearPassword(password: string) {
  return bcrypt.hash(String(password), RONDAS);
}

export async function verificarPassword(ingresada: string, guardada: string) {
  if (esHashBcrypt(guardada)) {
    return { valida: await bcrypt.compare(String(ingresada), guardada), necesitaRehash: false };
  }
  const valida = String(ingresada) === guardada;
  return { valida, necesitaRehash: valida };
}
