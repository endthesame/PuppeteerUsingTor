const puppeteer = require('puppeteer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Файл со ссылками
const linksFilePath = 'links_to_issues.txt';
const json_folder = path.join(__dirname,"jsons")
if (!fs.existsSync(json_folder)) fs.mkdirSync(json_folder);

// Считать все ссылки из файла
const getLinks = () => {
  try {
    const data = fs.readFileSync(linksFilePath, 'utf8');
    return data.trim().split('\n').map(link => link.trim()).filter(Boolean);
  } catch (err) {
    console.error('Ошибка чтения файла со ссылками:', err);
    return [];
  }
};

// Создать хеш из ссылки
const createHashFromLink = (url) => {
  return crypto.createHash('md5').update(encodeURIComponent(url)).digest('hex');
};

// Запустить обработку каждой ссылки
const processLink = async (url, browser) => {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  const metadata = await page.evaluate(() => {
    // Задаем структуру данных для сбора
    const volumeIssueHeader = document.querySelector('.App');
    const volumeIssue = volumeIssueHeader ? volumeIssueHeader.innerText.match(/Volume (\d+), issue (\d+)/) : [];
    const volume = volumeIssue ? volumeIssue[1] : "";
    const issue = volumeIssue ? volumeIssue[2] : "";
    const year = volumeIssueHeader ? volumeIssueHeader.innerText.match(/issue.*\(.* (\d{4})\)/)? volumeIssueHeader.innerText.match(/issue.*\(.* (\d{4})\)/)[1] : "" : "";
    const articles = [...document.querySelectorAll('.article-list > div')].map(div => {
      const titleSpan = div.querySelector('a div span');
      const authorsDiv = div.childNodes[0].textContent.trim().replaceAll(", ", "; ").replaceAll(" and ", "; ")
      const pagesDiv = div.querySelector('.pages');
      const pdfLink = div.querySelector('a') ? div.querySelector('a').href : "";
      return {
        title: titleSpan ? titleSpan.innerText : "",
        authors: authorsDiv || "",
        pages: pagesDiv ? pagesDiv.innerText.split('-').map(p => parseInt(p.trim(), 10)) : [],
        pdfLink
      };
    });

    return {
      volume,
      issue,
      year,
      articles
    };
  });

  if (!metadata || !metadata.articles.length) {
    console.error(`Не удалось извлечь статьи из ${url}`);
    await page.close();
    return;
  }

  // Форматировать дату как "ГГГГ-01-01"
  let date = "";
  if (metadata.year) {
    date = `${metadata.year}-01-01`;
  }

  // Сохраняем каждый JSON-файл
  for (const article of metadata.articles) {
    const hash = createHashFromLink(article.pdfLink);
    const jsonFilename = `${hash}.json`;

    const articleData = {
      "202": article.title || "",
      "200": article.authors || "",
      "197": article.pages[0].toString() || "",
      "198": article.pages[1].toString() || "",
      "176": metadata.volume || "",
      "208": metadata.issue || "",
      "203": date || "",
      "217": article.pdfLink || "",
      "232": "Algebraic Geometry",
      "184": "2313-1691",
      "185": "2214-2584",
    };
    if (articleData["217"] == ""){
      console.log(`No pdf link found for ${url}`);
    }
    if (articleData["202"] == ""){
      console.log(`No title found for ${url}`);
    }

    fs.writeFileSync(path.join(json_folder, jsonFilename), JSON.stringify(articleData, null, 2));

    // Записываем ссылку на PDF в файл Links.txt
    fs.appendFileSync(
      path.join(__dirname, 'Links.txt'),
      `${article.pdfLink} ${hash}.pdf\n`
    );
  }

  await page.close();
};

const run = async () => {
    const browser = await puppeteer.launch({
    //args: ['--proxy-server=127.0.0.1:8118'],
    headless: 'new' //'new' for "true mode" and false for "debug modenode (Browser open))"
    });
  const links = getLinks();

  for (const link of links) {
    console.log(`Обрабатывается ${link}`);
    await processLink(link, browser);
  }

  await browser.close();
};

run().catch(err => console.error('Ошибка в работе скрипта:', err));