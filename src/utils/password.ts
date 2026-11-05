import bcrypt from 'bcryptjs';

const RONDAS = 10;

// Los hashes de bcrypt empiezan con "$2a$", "$2b$" o "$2y$"
const esHashBcrypt = (valor: string) => /^\$2[aby]\$\d{2}\$/.test(valor);

export function hashearPassword(password: string) {
  return bcrypt.hash(String(password), RONDAS);
}

// Compara la contraseña ingresada con la guardada.
// "necesitaRehash" es true si la guardada estaba en texto plano (usuarios de antes de bcrypt):
// en ese caso hay que hashearla y guardarla.
export async function verificarPassword(ingresada: string, guardada: string) {
  if (esHashBcrypt(guardada)) {
    return { valida: await bcrypt.compare(String(ingresada), guardada), necesitaRehash: false };
  }
  const valida = String(ingresada) === guardada;
  return { valida, necesitaRehash: valida };
}
