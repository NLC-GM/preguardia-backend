import { Router } from 'express';
import { prisma } from '../prisma';
import { generarToken } from '../middleware/auth';
import { hashearPassword, verificarPassword } from '../utils/password';
import { ERROR_DNI, esDniValido, limpiarDni } from '../utils/validaciones';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan email o contraseña' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email: String(email).toLowerCase().trim() },
      include: { hospital: true },
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    const { valida, necesitaRehash } = await verificarPassword(password, usuario.password);
    if (!valida) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    if (!usuario.activo) {
      return res.status(403).json({ error: 'Esta cuenta fue desactivada' });
    }

    if (necesitaRehash) {
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { password: await hashearPassword(password) },
      });
    }

    const { password: _pw, ...usuarioSinPassword } = usuario;
    return res.json({ token: generarToken(usuario), usuario: usuarioSinPassword });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.post('/registro', async (req, res) => {
  const { nombre, email, password, dni } = req.body;

  if (!nombre?.trim() || !email?.trim() || !password || !dni) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const emailLimpio = String(email).toLowerCase().trim();
  const dniLimpio = limpiarDni(dni);

  if (!esDniValido(dniLimpio)) {
    return res.status(400).json({ error: ERROR_DNI });
  }

  try {
    const existeEmail = await prisma.usuario.findUnique({ where: { email: emailLimpio } });
    if (existeEmail) {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }

    const existeDni = await prisma.usuario.findUnique({ where: { dni: dniLimpio } });
    if (existeDni) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese DNI' });
    }

    const nuevoPaciente = await prisma.usuario.create({
      data: {
        nombre: String(nombre).trim(),
        email: emailLimpio,
        password: await hashearPassword(password),
        dni: dniLimpio,
        rol: 'Paciente',
        activo: true,
      },
    });

    const { password: _pw, ...usuarioSinPassword } = nuevoPaciente;
    return res
      .status(201)
      .json({ token: generarToken(nuevoPaciente), usuario: usuarioSinPassword });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

router.post('/restablecer', async (req, res) => {
  const { email, dni, nuevaPassword } = req.body;

  if (!email?.trim() || !dni || !nuevaPassword) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (String(nuevaPassword).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const emailLimpio = String(email).toLowerCase().trim();
  const dniLimpio = limpiarDni(dni);

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email: emailLimpio } });

    if (!usuario || !usuario.dni || usuario.dni !== dniLimpio) {
      return res.status(400).json({ error: 'El correo y el DNI no coinciden con ninguna cuenta' });
    }
    if (!usuario.activo) {
      return res.status(403).json({ error: 'Esta cuenta fue desactivada' });
    }

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { password: await hashearPassword(nuevaPassword) },
    });

    return res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
});

export default router;