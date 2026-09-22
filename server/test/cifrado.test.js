'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, describe, it } = require('node:test');

const CLAVE = crypto.randomBytes(32).toString('base64');
const OTRA_CLAVE = crypto.randomBytes(32).toString('base64');

let claveOriginal;

before(() => {
  claveOriginal = process.env.CLAVE_CIFRADO_API_KEYS;
  process.env.CLAVE_CIFRADO_API_KEYS = CLAVE;
});

after(() => {
  if (claveOriginal === undefined) delete process.env.CLAVE_CIFRADO_API_KEYS;
  else process.env.CLAVE_CIFRADO_API_KEYS = claveOriginal;
});

const { ErrorCifrado, cifrar, descifrar, estaCifrado, generarClave } = require('../src/lib/cifrado');
const { cifrarEnArgs, descifrarEnResultado } = require('../src/lib/cifradoUsuario');

describe('cifrado', () => {
  it('descifra lo que cifra', () => {
    const secreto = 'sk-proj-abc123-ñ-áé-🙂';
    assert.equal(descifrar(cifrar(secreto)), secreto);
  });

  it('nunca deja el secreto a la vista', () => {
    const cifrado = cifrar('sk-proj-abc123');
    assert.ok(!cifrado.includes('sk-proj-abc123'));
    assert.ok(cifrado.startsWith('v1.'));
  });

  it('usa un IV distinto cada vez', () => {
    assert.notEqual(cifrar('sk-igual'), cifrar('sk-igual'));
  });

  it('deja pasar null y undefined', () => {
    assert.equal(cifrar(null), null);
    assert.equal(cifrar(undefined), undefined);
    assert.equal(descifrar(null), null);
    assert.equal(descifrar(undefined), undefined);
  });

  it('no vuelve a cifrar un valor ya cifrado', () => {
    const cifrado = cifrar('sk-proj-abc123');
    assert.equal(cifrar(cifrado), cifrado);
  });

  it('reconoce el formato cifrado', () => {
    assert.equal(estaCifrado(cifrar('sk-1')), true);
    assert.equal(estaCifrado('sk-proj-en-claro'), false);
    assert.equal(estaCifrado('v1.corto'), false);
    assert.equal(estaCifrado(null), false);
  });

  it('rechaza un valor en texto plano al descifrar', () => {
    assert.throws(() => descifrar('sk-proj-en-claro'), ErrorCifrado);
  });

  it('detecta que han manipulado el dato', () => {
    const partes = cifrar('sk-proj-abc123').split('.');
    const manipulado = Buffer.from(partes[3], 'base64');
    manipulado[0] ^= 0xff;
    partes[3] = manipulado.toString('base64');
    assert.throws(() => descifrar(partes.join('.')), ErrorCifrado);
  });

  it('no descifra con otra clave', () => {
    const cifrado = cifrar('sk-proj-abc123');
    process.env.CLAVE_CIFRADO_API_KEYS = OTRA_CLAVE;
    try {
      assert.throws(() => descifrar(cifrado), ErrorCifrado);
    } finally {
      process.env.CLAVE_CIFRADO_API_KEYS = CLAVE;
    }
  });

  it('acepta la clave en hexadecimal', () => {
    const hex = crypto.randomBytes(32).toString('hex');
    process.env.CLAVE_CIFRADO_API_KEYS = hex;
    try {
      assert.equal(descifrar(cifrar('sk-hex')), 'sk-hex');
    } finally {
      process.env.CLAVE_CIFRADO_API_KEYS = CLAVE;
    }
  });

  it('avisa si la clave falta o no mide 32 bytes', () => {
    delete process.env.CLAVE_CIFRADO_API_KEYS;
    try {
      assert.throws(() => cifrar('sk-1'), /CLAVE_CIFRADO_API_KEYS/);
      process.env.CLAVE_CIFRADO_API_KEYS = Buffer.from('demasiado corta').toString('base64');
      assert.throws(() => cifrar('sk-1'), /32 bytes/);
    } finally {
      process.env.CLAVE_CIFRADO_API_KEYS = CLAVE;
    }
  });

  it('genera claves que valen', () => {
    process.env.CLAVE_CIFRADO_API_KEYS = generarClave();
    try {
      assert.equal(descifrar(cifrar('sk-generada')), 'sk-generada');
    } finally {
      process.env.CLAVE_CIFRADO_API_KEYS = CLAVE;
    }
  });
});

describe('cifrado en las consultas de Prisma', () => {
  it('cifra las API keys de un create', () => {
    const args = cifrarEnArgs({ data: { email: 'a@b.c', apiKeyOpenAI: 'sk-1', apiKeyEleven: 'el-2' } });
    assert.equal(args.data.email, 'a@b.c');
    assert.equal(descifrar(args.data.apiKeyOpenAI), 'sk-1');
    assert.equal(descifrar(args.data.apiKeyEleven), 'el-2');
  });

  it('cifra dentro de { set: ... }', () => {
    const args = cifrarEnArgs({ where: { id: '1' }, data: { apiKeyOpenAI: { set: 'sk-1' } } });
    assert.equal(descifrar(args.data.apiKeyOpenAI.set), 'sk-1');
  });

  it('cifra en escrituras anidadas y en createMany', () => {
    const anidado = cifrarEnArgs({ data: { nombre: 'p', usuario: { create: { apiKeyOpenAI: 'sk-1' } } } });
    assert.equal(descifrar(anidado.data.usuario.create.apiKeyOpenAI), 'sk-1');

    const varios = cifrarEnArgs({ data: [{ apiKeyOpenAI: 'sk-1' }, { apiKeyOpenAI: 'sk-2' }] });
    assert.deepEqual(varios.data.map((fila) => descifrar(fila.apiKeyOpenAI)), ['sk-1', 'sk-2']);
  });

  it('no toca select ni include', () => {
    const args = cifrarEnArgs({ select: { apiKeyOpenAI: true }, include: { proyectos: true } });
    assert.deepEqual(args, { select: { apiKeyOpenAI: true }, include: { proyectos: true } });
  });

  it('no deja filtrar por una API key', () => {
    assert.throws(() => cifrarEnArgs({ where: { apiKeyOpenAI: 'sk-1' } }), ErrorCifrado);
    assert.throws(() => cifrarEnArgs({ where: { OR: [{ apiKeyEleven: 'el-2' }] } }), ErrorCifrado);
  });

  it('no altera unos args sin API keys', () => {
    const original = { where: { email: 'a@b.c' }, data: { nombre: 'Radio GTA' } };
    assert.deepEqual(cifrarEnArgs(original), original);
  });

  it('descifra el registro devuelto, tambien en una relación incluida', () => {
    const cifrado = cifrar('sk-1');
    assert.equal(descifrarEnResultado({ id: '1', apiKeyOpenAI: cifrado }).apiKeyOpenAI, 'sk-1');
    assert.equal(descifrarEnResultado([{ apiKeyOpenAI: cifrado }])[0].apiKeyOpenAI, 'sk-1');
    assert.equal(descifrarEnResultado({ usuario: { apiKeyOpenAI: cifrado } }).usuario.apiKeyOpenAI, 'sk-1');
  });

  it('respeta fechas, nulos y resultados que no son registros', () => {
    const fecha = new Date('2026-09-22T00:00:00Z');
    const resultado = descifrarEnResultado({ createdAt: fecha, apiKeyEleven: null });
    assert.equal(resultado.createdAt, fecha);
    assert.equal(resultado.apiKeyEleven, null);
    assert.deepEqual(descifrarEnResultado({ count: 3 }), { count: 3 });
  });

  it('cifrar y descifrar se compensan de punta a punta', () => {
    const args = cifrarEnArgs({ data: { email: 'a@b.c', apiKeyOpenAI: 'sk-1', apiKeyEleven: null } });
    assert.deepEqual(descifrarEnResultado({ id: '1', ...args.data }), {
      id: '1',
      email: 'a@b.c',
      apiKeyOpenAI: 'sk-1',
      apiKeyEleven: null,
    });
  });
});
