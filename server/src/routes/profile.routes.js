const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { uploadProfilePhoto } = require("../middleware/upload");
const profileController = require("../controllers/profile.controller");

// `protect` covers every route here, including the read route: the upload
// directory is deliberately not a static web root, so this authenticated
// endpoint is the only way a stored photo can be fetched.
router.use(protect);

// A photo is filed under its owner's folder, so it is addressed by
// owner id + filename. The flat form is still served because files written
// before photos were filed per account are still on disk.
router.get("/photo/:userId/:filename", profileController.getPhoto);
router.get("/photo/:filename", profileController.getPhoto);

router.post("/photo", uploadProfilePhoto, profileController.uploadPhoto);
router.delete("/photo", profileController.removePhoto);

module.exports = router;