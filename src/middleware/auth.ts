import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en el archivo .env del backend');
}

const DURACION_TOKEN = '7d';

type PayloadToken = { id: number; rol: string };

export type UsuarioSesion = {
  id: number;
  rol: string;
  hospitalId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioSesion;
    }
  }
}

export function generarToken(usuario: { id: number; rol: string }) {
  const payload: PayloadToken = { id: usuario.id, rol: usuario.rol };
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: DURACION_TOKEN });
}

export async function requiereAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Tenés que iniciar sesión' });
  }

  let payload: PayloadToken;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET!) as PayloadToken;
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o vencida' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, rol: true, hospitalId: true, activo: true },
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Sesión inválida o vencida' });
    }
    if (!usuario.activo) {
      return res.status(403).json({ error: 'Esta cuenta fue desactivada' });
    }

    req.usuario = { id: usuario.id, rol: usuario.rol, hospitalId: usuario.hospitalId };
    return next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al validar la sesión' });
  }
}

export function soloPropio(param: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || Number(req.params[param]) !== req.usuario.id) {
      return res.status(403).json({ error: 'No tenés permisos para acceder a datos de otro usuario' });
    }
    return next();
  };
}

export function requiereRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
    }
    return next();
  };
}
