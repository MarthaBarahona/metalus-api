const request = require('supertest');
const http = require('http');
const express = require('express');
const kraken = require('kraken-js');
const BaseModel = require('../../lib/base.model');
const expect = require('chai').expect;
const packageObjectData = require('../data/package-objects');
const MongoDb = require('../../lib/mongo');
const util = require('util');

describe('Package Objects API Mongo Tests', () => {
  let app;
  let server;
  let mock;
  const body = packageObjectData.find(po => po.id === 'com.acxiom.pipeline.steps.DataFrameReaderOptions');

  before((done) => {
    app = express();
    server = http.createServer(app);
    app.on('start', () => {
      done();
    });
    app.use(kraken({
      basedir: process.cwd(),
      onconfig: (config, next) => {
        config.set('storageType', 'mongodb');
        config.set('databaseName', 'testDataPackageObjects');
        BaseModel.initialStorageParameters(config);
        MongoDb.init(config)
          .then(() => {
            next(null, config);
          })
          .catch(next);
      }
    }));
    mock = server.listen(1306);
  });

  after(async () => {
    app.removeAllListeners('start');
    await MongoDb.getDatabase().dropDatabase();
    await MongoDb.disconnect();
    await util.promisify(mock.close.bind(mock))();
  });

  it('Should fail insert on missing body', async () => {
    const response = await request(mock)
      .post('/api/v1/package-objects/')
      .expect('Content-Type', /json/)
      .expect(400);
    const stepResponse = JSON.parse(response.text);
    expect(stepResponse).to.exist;
    expect(stepResponse).to.have.property('message').eq('POST request missing body');
    await request(mock).get('/api/v1/package-objects').expect(204);
  });

  it('Should fail validation on insert', async () => {
    const response = await request(mock)
      .post('/api/v1/package-objects/')
      .send({ name: '1'})
      .expect('Content-Type', /json/)
      .expect(422);
    const stepResponse = JSON.parse(response.text);
    expect(stepResponse).to.exist;
    expect(stepResponse).to.have.property('errors').lengthOf(1);
    expect(stepResponse).to.have.property('body');
    const errors = stepResponse.errors;
    expect(errors.find(err => err.params.missingProperty === 'schema')).to.exist
    await request(mock).get('/api/v1/package-objects').expect(204);
  });

  it('Should not return a package-object', async () => {
    await request(mock).get('/api/v1/package-objects/bad-id').expect(204);
  });

  it('Should insert a single package-object', async () => {
    const response = await request(mock)
      .post('/api/v1/package-objects/')
      .send(body)
      .expect('Content-Type', /json/)
      .expect(201);
    const resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-object');
    verifyPackageObject(resp['package-object'], body);
  });

  it('Should get the inserted package-object', async () => {
    const response = await request(mock)
      .get(`/api/v1/package-objects/${body.id}`)
      .expect('Content-Type', /json/)
      .expect(200);
    const resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-object');
    verifyPackageObject(resp['package-object'], body);
  });

  it('Should get all package-objects', async () => {
    const response = await request(mock)
      .get('/api/v1/package-objects')
      .expect('Content-Type', /json/)
      .expect(200);
    const resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-objects').lengthOf(1);
    verifyPackageObject(resp['package-objects'][0], body)
  });

  it('Should update a package-object', async () => {
    body.schema = `update:${body.schema}`;
    const response = await request(mock)
      .put(`/api/v1/package-objects/${body.id}`)
      .send(body)
      .expect('Content-Type', /json/)
      .expect(200);
    const resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-object');
    verifyPackageObject(resp['package-object'], body);
  });

  it('Should delete a package-object', async () => {
    await request(mock).delete(`/api/v1/package-objects/${body.id}`).expect(204);
    await request(mock).get('/api/v1/package-objects/').expect(204);
  });

  it('Should upsert a single package-object', async () => {
    body.schema = packageObjectData.find(po => po.id === 'com.acxiom.pipeline.steps.DataFrameReaderOptions').schema;
    const response = await request(mock)
      .put(`/api/v1/package-objects/${body.id}`)
      .send(body)
      .expect('Content-Type', /json/)
      .expect(200);
    const resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-object');
    verifyPackageObject(resp['package-object'], body);
  });

  it('Should update a single package-object using post', async () => {
    body.schema = `update:${body.schema}`;
    const response = await request(mock)
      .post('/api/v1/package-objects/')
      .send(body)
      .expect('Content-Type', /json/)
      .expect(201);
    const resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-object');
    verifyPackageObject(resp['package-object'], body);
  });

  it('Should insert multiple package-objects', async () => {
    const data = packageObjectData.filter(po => po.id !== 'com.acxiom.pipeline.steps.DataFrameReaderOptions');
    let response = await request(mock)
      .post('/api/v1/package-objects/')
      .send(data)
      .expect('Content-Type', /json/)
      .expect(201);
    let resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-objects').lengthOf(5);
    resp['package-objects'].forEach(po => verifyPackageObject(po, data.find(p => p.id === po.id)));
    response = await request(mock)
      .get('/api/v1/package-objects/')
      .expect('Content-Type', /json/)
      .expect(200);
    resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('package-objects').lengthOf(6);
  });

  it('Should validate an object against a stored schema', async () => {
    const body = {
      attributes: [
        {
          extraProperty: 'should not be here'
        }
      ]
    };
    let response = await request(mock)
      .patch('/api/v1/package-objects/com.acxiom.pipeline.steps.Schema/validate-object')
      .send(body)
      .expect('Content-Type', /json/)
      .expect(422);
    let resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('isValid').eq(false);
    expect(resp).to.have.property('errors').lengthOf(1);
    const error = resp.errors[0];
    expect(error).to.have.property('keyword').eq('additionalProperties');
    expect(error).to.have.property('message').eq('should NOT have additional properties');
    body.attributes[0].name = 'col1';
    body.attributes[0].dataType = 'string';
    delete body.attributes[0].extraProperty;
    response = await request(mock)
      .patch('/api/v1/package-objects/com.acxiom.pipeline.steps.Schema/validate-object')
      .send(body)
      .expect('Content-Type', /json/)
      .expect(200);
    resp = JSON.parse(response.text);
    expect(resp).to.exist;
    expect(resp).to.have.property('isValid').eq(true);
  });

  function verifyPackageObject(pkgObj, original) {
    expect(pkgObj).to.have.property('id').eq(original.id);
    expect(pkgObj).to.have.property('schema').eq(original.schema);
  }
});
