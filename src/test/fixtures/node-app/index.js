const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_req, res) => res.send('vibe-ok'));

app.listen(port, () => console.log(`fixture listening on ${port}`));
