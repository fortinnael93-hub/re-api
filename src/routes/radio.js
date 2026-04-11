const express = require('express');
const router = express.Router();

/**
 * GET /radio/api
 * Retourne les infos de la radio du launcher.
 * Personnalisez les valeurs selon votre radio.
 */
router.get('/api', (req, res) => {
    return res.json({
        enabled: process.env.RADIO_ENABLED === 'true',
        name:    process.env.RADIO_NAME    || 'Radio NG',
        url:     process.env.RADIO_URL     || '',
        nowPlaying: null
    });
});

/**
 * GET /radio/stream  (optionnel — redirige vers le flux)
 */
router.get('/stream', (req, res) => {
    const url = process.env.RADIO_URL;
    if (!url) return res.status(404).json({ error: 'Aucun flux radio configuré' });
    return res.redirect(url);
});

module.exports = router;
