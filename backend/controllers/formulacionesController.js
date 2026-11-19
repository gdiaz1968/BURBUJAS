const service = require('../services/formulacionesService');

function responderError(res, error) {
  const status = error.statusCode || (error.code === '23505' ? 409 : 500);
  if (status >= 500) console.error('Error en formulaciones:', error.message);
  return res.status(status).json({
    error: status >= 500 ? 'No se pudo procesar la solicitud.' : error.message,
  });
}

function validarOrganizacion(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Debe indicar un organizacion_id válido.');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

exports.obtenerCatalogos = async (req, res) => {
  try {
    const organizacionId = validarOrganizacion(req.query.organizacion_id);
    const data = await service.obtenerCatalogos(organizacionId);
    return res.json(data);
  } catch (error) {
    return responderError(res, error);
  }
};

exports.listar = async (req, res) => {
  try {
    const organizacionId = validarOrganizacion(req.query.organizacion_id);
    const data = await service.listar(organizacionId);
    return res.json(data);
  } catch (error) {
    return responderError(res, error);
  }
};

exports.obtenerPorId = async (req, res) => {
  try {
    const organizacionId = validarOrganizacion(req.query.organizacion_id);
    const data = await service.obtenerPorId(organizacionId, req.params.id);
    return res.json(data);
  } catch (error) {
    return responderError(res, error);
  }
};

exports.crearBorrador = async (req, res) => {
  try {
    const organizacionId = validarOrganizacion(req.body.organizacion_id);
    const data = await service.crearBorrador(organizacionId, req.body);
    return res.status(201).json(data);
  } catch (error) {
    return responderError(res, error);
  }
};

exports.actualizarBorrador = async (req, res) => {
  try {
    const organizacionId = validarOrganizacion(req.body.organizacion_id);
    const data = await service.actualizarBorrador(organizacionId, req.params.id, req.body);
    return res.json(data);
  } catch (error) {
    return responderError(res, error);
  }
};
