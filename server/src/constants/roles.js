// Legacy shim. The canonical role definitions live in `../config/roles` so there
// is a single source of truth and no role can drift back into existence here.
// `LABORATORY` is kept as an alias of `LAB` for the laboratory router.
const { ROLES } = require("../config/roles");

module.exports = { ...ROLES, LABORATORY: ROLES.LAB };
