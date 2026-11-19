const pool = require('../db');

function crearError(mensaje, statusCode = 400) {
  const error = new Error(mensaje);
  error.statusCode = statusCode;
  return error;
}

function idValido(value, campo) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw crearError(`${campo} no es válido.`);
  return id;
}

function cantidadValida(value, campo) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0) {
    throw crearError(`${campo} debe ser un número mayor que cero.`);
  }
  return text;
}

function textoObligatorio(value, campo, max = 200) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw crearError(`${campo} es obligatorio y admite hasta ${max} caracteres.`);
  return text;
}

function normalizarDetalles(detalles) {
  if (detalles === undefined) return [];
  if (!Array.isArray(detalles)) throw crearError('detalles debe ser una lista.');
  if (detalles.length > 200) throw crearError('Una formulación no puede superar 200 componentes.');
  return detalles.map((item, index) => ({
    orden: index + 1,
    materia_prima_id: idValido(item.materia_prima_id, `Componente ${index + 1}: materia_prima_id`),
    cantidad: cantidadValida(item.cantidad, `Componente ${index + 1}: cantidad`),
    unidad_medida_id: idValido(item.unidad_medida_id, `Componente ${index + 1}: unidad_medida_id`),
    observaciones: item.observaciones == null ? null : String(item.observaciones).trim(),
  }));
}

async function validarProductoYUnidad(client, organizacionId, productoId, unidadId, tipoEsperado, etiqueta) {
  const result = await client.query(
    `SELECT p.id, p.tipo_item, p.unidad_base_id, ub.magnitud AS magnitud_base,
            um.id AS unidad_solicitada_id, um.magnitud AS magnitud_solicitada
       FROM productos p
       JOIN unidades_medida ub ON ub.id = p.unidad_base_id
       JOIN unidades_medida um ON um.id = $3 AND um.activo = TRUE
      WHERE p.id = $1 AND p.organizacion_id = $2 AND p.activo = TRUE`,
    [productoId, organizacionId, unidadId],
  );

  if (result.rowCount === 0) {
    throw crearError(`${etiqueta}: el producto o la unidad no existe, no está activo o no pertenece a la organización.`, 422);
  }
  const row = result.rows[0];
  if (row.tipo_item !== tipoEsperado) {
    throw crearError(`${etiqueta}: el producto debe ser de tipo ${tipoEsperado}.`, 422);
  }
  if (row.magnitud_base !== row.magnitud_solicitada) {
    throw crearError(`${etiqueta}: la unidad indicada no corresponde a la magnitud de la unidad base del producto.`, 422);
  }
}

async function validarDatos(client, organizacionId, datos, detalles) {
  const productoId = idValido(datos.producto_id, 'producto_id');
  const rendimientoUnidadId = idValido(datos.rendimiento_unidad_id, 'rendimiento_unidad_id');
  await validarProductoYUnidad(client, organizacionId, productoId, rendimientoUnidadId, 'PRODUCTO_TERMINADO', 'Producto elaborado');

  for (const detalle of detalles) {
    await validarProductoYUnidad(
      client,
      organizacionId,
      detalle.materia_prima_id,
      detalle.unidad_medida_id,
      'MATERIA_PRIMA',
      `Componente ${detalle.orden}`,
    );
  }
  return { productoId, rendimientoUnidadId };
}

exports.obtenerCatalogos = async (organizacionId) => {
  const [productos, unidades] = await Promise.all([
    pool.query(
      `SELECT id, codigo, nombre, tipo_item, unidad_base_id
         FROM productos
        WHERE organizacion_id = $1 AND activo = TRUE
          AND tipo_item IN ('PRODUCTO_TERMINADO', 'MATERIA_PRIMA')
        ORDER BY tipo_item, nombre`,
      [organizacionId],
    ),
    pool.query(
      `SELECT id, codigo, nombre, magnitud, decimales
         FROM unidades_medida WHERE activo = TRUE ORDER BY magnitud, nombre`,
    ),
  ]);
  return { productos: productos.rows, unidades: unidades.rows };
};

exports.listar = async (organizacionId) => {
  const result = await pool.query(
    `SELECT f.id, f.codigo, f.producto_id, p.codigo AS producto_codigo,
            p.nombre AS producto_nombre, f.version, f.rendimiento_cantidad,
            f.rendimiento_unidad_id, u.codigo AS rendimiento_unidad,
            f.estado, f.creado_en, f.actualizado_en
       FROM formulaciones f
       JOIN productos p ON p.id = f.producto_id
       JOIN unidades_medida u ON u.id = f.rendimiento_unidad_id
      WHERE f.organizacion_id = $1
      ORDER BY f.codigo, f.version DESC`,
    [organizacionId],
  );
  return result.rows;
};

exports.obtenerPorId = async (organizacionId, id) => {
  const formulaId = idValido(id, 'id');
  const formula = await pool.query(
    `SELECT f.*, p.codigo AS producto_codigo, p.nombre AS producto_nombre,
            u.codigo AS rendimiento_unidad, u.nombre AS rendimiento_unidad_nombre
       FROM formulaciones f
       JOIN productos p ON p.id = f.producto_id
       JOIN unidades_medida u ON u.id = f.rendimiento_unidad_id
      WHERE f.id = $1 AND f.organizacion_id = $2`,
    [formulaId, organizacionId],
  );
  if (formula.rowCount === 0) throw crearError('No se encontró la formulación solicitada.', 404);

  const detalles = await pool.query(
    `SELECT d.id, d.orden, d.materia_prima_id, p.codigo AS materia_prima_codigo,
            p.nombre AS materia_prima_nombre, d.cantidad, d.unidad_medida_id,
            u.codigo AS unidad_codigo, u.nombre AS unidad_nombre, d.observaciones
       FROM formulacion_detalles d
       JOIN productos p ON p.id = d.materia_prima_id
       JOIN unidades_medida u ON u.id = d.unidad_medida_id
      WHERE d.formulacion_id = $1 AND d.organizacion_id = $2
      ORDER BY d.orden`,
    [formulaId, organizacionId],
  );
  return { ...formula.rows[0], detalles: detalles.rows };
};

exports.crearBorrador = async (organizacionId, datos) => {
  const codigo = textoObligatorio(datos.codigo, 'codigo', 60);
  const procedimiento = textoObligatorio(datos.procedimiento, 'procedimiento', 20000);
  const rendimiento = cantidadValida(datos.rendimiento_cantidad, 'rendimiento_cantidad');
  const detalles = normalizarDetalles(datos.detalles);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { productoId, rendimientoUnidadId } = await validarDatos(client, organizacionId, datos, detalles);
    const inserted = await client.query(
      `INSERT INTO formulaciones
        (organizacion_id, codigo, producto_id, version, rendimiento_cantidad,
         rendimiento_unidad_id, procedimiento, observaciones, estado)
       VALUES ($1, $2, $3,
         (SELECT COALESCE(MAX(version), 0) + 1 FROM formulaciones WHERE organizacion_id = $1 AND codigo = $2),
         $4, $5, $6, $7, 'BORRADOR')
       RETURNING id, organizacion_id, codigo, producto_id, version,
                 rendimiento_cantidad, rendimiento_unidad_id, procedimiento,
                 observaciones, estado, creado_en, actualizado_en`,
      [organizacionId, codigo, productoId, rendimiento, rendimientoUnidadId, procedimiento, datos.observaciones || null],
    );
    const formula = inserted.rows[0];
    for (const detalle of detalles) {
      await client.query(
        `INSERT INTO formulacion_detalles
          (formulacion_id, organizacion_id, orden, materia_prima_id, cantidad, unidad_medida_id, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [formula.id, organizacionId, detalle.orden, detalle.materia_prima_id, detalle.cantidad, detalle.unidad_medida_id, detalle.observaciones],
      );
    }
    await client.query('COMMIT');
    return { ...formula, cantidad_componentes: detalles.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.actualizarBorrador = async (organizacionId, id, datos) => {
  const formulaId = idValido(id, 'id');
  const codigo = textoObligatorio(datos.codigo, 'codigo', 60);
  const procedimiento = textoObligatorio(datos.procedimiento, 'procedimiento', 20000);
  const rendimiento = cantidadValida(datos.rendimiento_cantidad, 'rendimiento_cantidad');
  const detalles = normalizarDetalles(datos.detalles);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const actual = await client.query(
      'SELECT id, estado FROM formulaciones WHERE id = $1 AND organizacion_id = $2 FOR UPDATE',
      [formulaId, organizacionId],
    );
    if (actual.rowCount === 0) throw crearError('No se encontró la formulación solicitada.', 404);
    if (actual.rows[0].estado !== 'BORRADOR') {
      throw crearError('Solo se pueden modificar formulaciones en estado BORRADOR. Para cambiar una formulación vigente se debe crear una nueva versión.', 409);
    }

    const { productoId, rendimientoUnidadId } = await validarDatos(client, organizacionId, datos, detalles);
    const updated = await client.query(
      `UPDATE formulaciones
          SET codigo = $3, producto_id = $4, rendimiento_cantidad = $5,
              rendimiento_unidad_id = $6, procedimiento = $7,
              observaciones = $8, actualizado_en = NOW()
        WHERE id = $1 AND organizacion_id = $2
        RETURNING id, organizacion_id, codigo, producto_id, version,
                  rendimiento_cantidad, rendimiento_unidad_id, procedimiento,
                  observaciones, estado, creado_en, actualizado_en`,
      [formulaId, organizacionId, codigo, productoId, rendimiento, rendimientoUnidadId, procedimiento, datos.observaciones || null],
    );

    await client.query('DELETE FROM formulacion_detalles WHERE formulacion_id = $1 AND organizacion_id = $2', [formulaId, organizacionId]);
    for (const detalle of detalles) {
      await client.query(
        `INSERT INTO formulacion_detalles
          (formulacion_id, organizacion_id, orden, materia_prima_id, cantidad, unidad_medida_id, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [formulaId, organizacionId, detalle.orden, detalle.materia_prima_id, detalle.cantidad, detalle.unidad_medida_id, detalle.observaciones],
      );
    }
    await client.query('COMMIT');
    return { ...updated.rows[0], cantidad_componentes: detalles.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
