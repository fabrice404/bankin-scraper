const cheerio = require('cheerio');
const moment = require('moment');
const { Builder, By, until } = require('selenium-webdriver');

const defaultConfig = {
  url: 'https://app2.bankin.com/signin',
  browser: 'chrome',
};

module.exports = {
  get: async (_config) => {
    const config = Object.assign(defaultConfig, _config);
    const driver = new Builder()
      .forBrowser(config.browser)
      .build();

    const getElement = async (selector) => {
      const by = selector.startsWith('/') ? By.xpath(selector) : By.id(selector);
      await driver.wait(until.elementLocated(by));
      return driver.wait(until.elementIsVisible(driver.findElement(by)));
    };

    const getContent = async (selector) => {
      const element = await getElement(selector);
      return element.getAttribute('innerHTML');
    };

    const click = async (selector) => {
      const element = await getElement(selector);
      await element.click();
    };

    const getAmountFromText = (text) => (text.match(/DR/) ? -1 : 1) * parseFloat(text.replace(/[^0-9.-]/g, ''));

    const result = [];

    // navigate to url
    await driver.get(config.url);

    // set login
    const email = await getElement('signin_email');
    email.sendKeys(config.login);

    // set password
    const password = await getElement('signin_password');
    password.sendKeys(config.password);

    // click connect button
    await click('//button[@type="submit"]');

    // list all accounts
    const accountIds = [];
    const content = await getContent('//div[contains(@class, "accountList")]');
    let $ = cheerio.load(content);

    $('a.accountRow').each((i, a) => {
      accountIds.push($(a).attr('href').split('/').pop());
    });

    for (let index = 0; index < accountIds.length; index += 1) {
      await getElement('//div[contains(@class, "accountList")]');

      const id = accountIds[index];
      click(`//a[@href="/accounts/${id}"]`);

      await getElement('//td[contains(@class, "topHeader")]');

      const nameElement = await getContent('//td[contains(@class, "topHeader")]/header/div[2]/span[1]');
      const balanceElement = await getContent('//td[contains(@class, "topHeader")]/header/div[2]/span[2]');
      const account = {
        id,
        name: nameElement.trim(),
        balance: getAmountFromText(balanceElement),
        available: getAmountFromText(balanceElement),
        transactions: { done: [], pending: [] },
      };

      const transactionsElement = await getContent('//td[contains(@class, "leftColumn")]');
      $ = cheerio.load(transactionsElement);
      $('ul.transactionList li').each((i, transaction) => {
        if ($(transaction).attr('id')) {
          const date = moment(
            $(transaction).find('.headerDate').first().text(),
            ['dddd, MMM D, YYYY'],
          ).format('YYYY-MM-DD');

          const name = $(transaction).find('.fw6').text().trim();
          const amount = getAmountFromText($(transaction).find('.amount').text());

          account.transactions.done.push({ date, name, amount });
        }
      });

      result.push(account);
      click('//a[@href="/accounts"]');
    }

    await getElement('//div[contains(@class, "accountList")]');

    if (!config.keepItOpen) {
      driver.quit();
    }
    return result;
  },
};
