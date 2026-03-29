const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const util = require('node:util');

const mainModulePath = require.resolve('./main');

function loadFreshMain() {
    delete require.cache[mainModulePath];
    return require('./main');
}

function makeApp(Application, people = [], selected = []) {
    const app = Object.create(Application.prototype);
    app.people = people;
    app.selected = selected;
    return app;
}

function waitForConstructorSetup() {
    return new Promise((resolve) => setImmediate(resolve));
}

test.afterEach(() => {
    mock.restoreAll();
    delete require.cache[mainModulePath];
});

test('MailSystem.write returns the expected mail content', () => {
    const log = mock.method(console, 'log', () => {});
    const { MailSystem } = loadFreshMain();
    const mailSystem = new MailSystem();

    const context = mailSystem.write('Alice');

    assert.equal(context, 'Congrats, Alice!');
    assert.deepEqual(log.mock.calls[0].arguments, ['--write mail for Alice--']);
});

test('MailSystem.send returns true when the random check succeeds', () => {
    const log = mock.method(console, 'log', () => {});
    mock.method(Math, 'random', () => 0.9);
    const { MailSystem } = loadFreshMain();
    const mailSystem = new MailSystem();

    const result = mailSystem.send('Bob', 'ignored');

    assert.equal(result, true);
    assert.deepEqual(log.mock.calls[0].arguments, ['--send mail to Bob--']);
    assert.deepEqual(log.mock.calls[1].arguments, ['mail sent']);
});

test('MailSystem.send returns false when the random check fails', () => {
    const log = mock.method(console, 'log', () => {});
    mock.method(Math, 'random', () => 0.1);
    const { MailSystem } = loadFreshMain();
    const mailSystem = new MailSystem();

    const result = mailSystem.send('Bob', 'ignored');

    assert.equal(result, false);
    assert.deepEqual(log.mock.calls[1].arguments, ['mail failed']);
});

test('Application constructor initializes state from getNames', async () => {
    const { Application, MailSystem } = loadFreshMain();
    mock.method(Application.prototype, 'getNames', async () => [['Amy', 'Bob'], ['Amy']]);

    const app = new Application();
    await waitForConstructorSetup();

    assert.deepEqual(app.people, ['Amy', 'Bob']);
    assert.deepEqual(app.selected, ['Amy']);
    assert.ok(app.mailSystem instanceof MailSystem);
});

test('Application.getNames reads the file and splits names by line', async () => {
    mock.method(util, 'promisify', () => async (fileName, encoding) => {
        assert.equal(fileName, 'name_list.txt');
        assert.equal(encoding, 'utf8');
        return 'Amy\nBob\nCara';
    });
    const { Application } = loadFreshMain();
    const app = makeApp(Application);

    const [people, selected] = await app.getNames();

    assert.deepEqual(people, ['Amy', 'Bob', 'Cara']);
    assert.deepEqual(selected, []);
});

test('Application.getRandomPerson uses Math.random to pick an index', () => {
    mock.method(Math, 'random', () => 0.7);
    const { Application } = loadFreshMain();
    const app = makeApp(Application, ['Amy', 'Bob', 'Cara']);

    const person = app.getRandomPerson();

    assert.equal(person, 'Cara');
});

test('Application.selectNextPerson retries until it finds an unselected person', () => {
    const log = mock.method(console, 'log', () => {});
    const { Application } = loadFreshMain();
    const app = makeApp(Application, ['Amy', 'Bob'], ['Amy']);
    let callCount = 0;
    const getRandomPerson = mock.method(app, 'getRandomPerson', () => {
        callCount += 1;
        return callCount === 1 ? 'Amy' : 'Bob';
    });

    const person = app.selectNextPerson();

    assert.equal(person, 'Bob');
    assert.deepEqual(app.selected, ['Amy', 'Bob']);
    assert.equal(getRandomPerson.mock.calls.length, 2);
    assert.deepEqual(log.mock.calls[0].arguments, ['--select next person--']);
});

test('Application.selectNextPerson returns null when everyone is already selected', () => {
    const log = mock.method(console, 'log', () => {});
    const { Application } = loadFreshMain();
    const app = makeApp(Application, ['Amy'], ['Amy']);

    const person = app.selectNextPerson();

    assert.equal(person, null);
    assert.deepEqual(log.mock.calls[1].arguments, ['all selected']);
});

test('Application.notifySelected writes and sends mail for every selected person', () => {
    const log = mock.method(console, 'log', () => {});
    const { Application, MailSystem } = loadFreshMain();
    const app = makeApp(Application, [], ['Amy', 'Bob']);
    app.mailSystem = new MailSystem();
    const write = mock.method(app.mailSystem, 'write', (name) => `Hello ${name}`);
    const send = mock.method(app.mailSystem, 'send', () => true);

    app.notifySelected();

    assert.deepEqual(log.mock.calls[0].arguments, ['--notify selected--']);
    assert.equal(write.mock.calls.length, 2);
    assert.equal(send.mock.calls.length, 2);
    assert.deepEqual(write.mock.calls[0].arguments, ['Amy']);
    assert.deepEqual(write.mock.calls[1].arguments, ['Bob']);
    assert.deepEqual(send.mock.calls[0].arguments, ['Amy', 'Hello Amy']);
    assert.deepEqual(send.mock.calls[1].arguments, ['Bob', 'Hello Bob']);
});
