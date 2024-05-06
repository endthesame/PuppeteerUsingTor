const fs = require('fs');
const path = require('path');
const { crawl, extractData, parsing } = require('./crawler');
const { downloadPDFs } = require('./download-utils-puppeteer');
const { checkAccess } = require('./utils');
const {Command} = require('commander')

async function main() {
    try {
        const program = new Command()
        program
            .name('Crawler')
            .description('Puppeteer crawler using node.js. You can crawl metadata using or own task; download pdfs; check open acces; etc')
            .version('0.0.1');

        program
            .option('-c, --coll_name <string>', 'collection name', 'default_host_name')
            .option('-o, --output <path>', 'path to output filder', path.join(__dirname, 'output'))
            .option('-d, --download_pdf', 'type this if you want to download pdfs')
            .option('-oa, --open_access', 'type this if you want to check open access before download')
            .option('-t, --use_tor', 'type this if you want to use tor for crawling')
            .option('-e, --task <path>', 'path to task extractor', path.join(__dirname, 'tasks/sample_task.js'))
            .option('-l, --links <path>', 'path to file with links', path.join(__dirname, 'your_links_file.txt'))
            .helpOption('-e, --HELP', 'read more information');

        program.parse();

        const hostNameForDir = program.opts().coll_name;//process.argv[2] || "default_host_name";
        const outputFolderPath = program.opts().output;//path.join(__dirname, 'output');
        const siteFolderPath = path.join(outputFolderPath, hostNameForDir);
        const jsonFolderPath = path.join(siteFolderPath, 'jsons');
        const pdfFolderPath = path.join(siteFolderPath, 'pdfs');
        const htmlFolderPath = path.join(siteFolderPath, 'htmls');
        const linksFilePath = path.join(siteFolderPath, 'remaining_links.txt');
        const sourceLinks = program.opts().links;

        // Создать структуру папок, если они не существуют
        if (!fs.existsSync(outputFolderPath)) fs.mkdirSync(outputFolderPath);
        if (!fs.existsSync(siteFolderPath)) fs.mkdirSync(siteFolderPath);
        if (!fs.existsSync(jsonFolderPath)) fs.mkdirSync(jsonFolderPath);
        if (!fs.existsSync(pdfFolderPath)) fs.mkdirSync(pdfFolderPath);
        if (!fs.existsSync(htmlFolderPath)) fs.mkdirSync(htmlFolderPath);

        
        // Копировать файл с ссылками
        fs.copyFileSync(sourceLinks, linksFilePath);
        
        // Запуск краулинга
        await crawl(jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, linksFilePath, task_path=program.opts().task, downloadPDFmark = program.opts().download_pdf, checkOpenAccess = program.opts().open_access, useTor=program.opts().use_tor);
        
        // Запуск скачивания PDF
        await downloadPDFs(path.join(siteFolderPath, "Links.txt"), pdfFolderPath);

        // Запуск обновления метаполей (парсинга)
        //await parsing(jsonFolderPath, htmlFolderPath);
    } catch (error) {
        console.error(`Error during setup: ${error.message}`);
    }
}

main().catch((error) => {
    console.error(`Error during crawling: ${error.message}`);
    console.error(error);
});