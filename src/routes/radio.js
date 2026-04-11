const express = require('express');
const router  = express.Router();

// Radio désactivée — retourne une réponse silencieuse
// Le launcher vérifie data.data.now_playing.song donc on retourne null proprement
router.get('/api', (req, res) => {
    return res.json({
        enabled: false,
        data: null
    });
});

router.get('/stream', (req, res) => {
    return res.status(404).json({ error: 'Radio non configurée' });
});

module.exports = router;
