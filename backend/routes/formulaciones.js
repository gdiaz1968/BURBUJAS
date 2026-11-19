const express = require('express');
const controller = require('../controllers/formulacionesController');

const router = express.Router();

// La organización todavía no se obtiene de una sesión autenticada.
// Se bloquea el módulo en producción hasta implementar autenticación y autorización por organización.
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(503).json({
      error: 'Módulo temporalmente deshabilitado: falta integrar autenticación y autorización por organización.',
    });
  }
  return next();
});

router.get('/catalogos', controller.obtenerCatalogos);
router.get('/', controller.listar);
router.get('/:id', controller.obtenerPorId);
router.post('/', controller.crearBorrador);
router.put('/:id', controller.actualizarBorrador);

module.exports = router;
