const { env } = require('./config/env');
const { app } = require('./app');

app.listen(env.PORT, () => {
  console.log(`Vynce Control Plane listening on port ${env.PORT}`);
});
