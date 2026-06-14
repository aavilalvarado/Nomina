-- GENERAR VACACIONES PARA TODOS LOS TRABAJADORES

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 1, '2025-11-22', '2026-11-22', 12, 0, 0, true
FROM trabajadores WHERE num_empleado = 1
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 1, '2024-01-01', '2025-01-01', 12, 0, 12, false
FROM trabajadores WHERE num_empleado = 2
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 2, '2025-01-01', '2026-01-01', 14, 0, 14, false
FROM trabajadores WHERE num_empleado = 2
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 3, '2026-01-01', '2027-01-01', 16, 0, 0, true
FROM trabajadores WHERE num_empleado = 2
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 1, '2024-04-14', '2025-04-14', 12, 0, 12, false
FROM trabajadores WHERE num_empleado = 3
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 2, '2025-04-14', '2026-04-14', 14, 0, 14, false
FROM trabajadores WHERE num_empleado = 3
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 3, '2026-04-14', '2027-04-14', 16, 0, 0, true
FROM trabajadores WHERE num_empleado = 3
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 1, '2017-09-16', '2018-09-16', 12, 0, 12, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 2, '2018-09-16', '2019-09-16', 14, 0, 14, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 3, '2019-09-16', '2020-09-16', 16, 0, 16, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 4, '2020-09-16', '2021-09-16', 18, 0, 18, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 5, '2021-09-16', '2022-09-16', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 6, '2022-09-16', '2023-09-16', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 7, '2023-09-16', '2024-09-16', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 8, '2024-09-16', '2025-09-16', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 9, '2025-09-16', '2026-09-16', 20, 0, 0, true
FROM trabajadores WHERE num_empleado = 4
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 1, '2018-06-05', '2019-06-05', 12, 0, 12, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 2, '2019-06-05', '2020-06-05', 14, 0, 14, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 3, '2020-06-05', '2021-06-05', 16, 0, 16, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 4, '2021-06-05', '2022-06-05', 18, 0, 18, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 5, '2022-06-05', '2023-06-05', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 6, '2023-06-05', '2024-06-05', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 7, '2024-06-05', '2025-06-05', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 8, '2025-06-05', '2026-06-05', 20, 0, 20, false
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 9, '2026-06-05', '2027-06-05', 20, 0, 0, true
FROM trabajadores WHERE num_empleado = 5
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 1, '2021-11-23', '2022-11-23', 12, 0, 12, false
FROM trabajadores WHERE num_empleado = 6
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 2, '2022-11-23', '2023-11-23', 14, 0, 14, false
FROM trabajadores WHERE num_empleado = 6
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 3, '2023-11-23', '2024-11-23', 16, 0, 16, false
FROM trabajadores WHERE num_empleado = 6
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 4, '2024-11-23', '2025-11-23', 18, 0, 18, false
FROM trabajadores WHERE num_empleado = 6
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;

INSERT INTO vacaciones (trabajador_id, anio_aniversario, fecha_otorgamiento, fecha_vencimiento, dias_disponibles, dias_tomados, dias_perdidos, activo)
SELECT id, 5, '2025-11-23', '2026-11-23', 20, 0, 0, true
FROM trabajadores WHERE num_empleado = 6
ON CONFLICT (trabajador_id, anio_aniversario) DO NOTHING;
