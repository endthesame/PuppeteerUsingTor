module.exports = function extractMetadata() {
    // Ваш код для извлечения метаданных здесь
    // Верните результат в виде объекта
    const getMetaAttribute = (selector, attribute, childSelector) => {
        const element = document.querySelector(selector);
        if (element) {
            const targetElement = childSelector ? element.querySelector(childSelector) : element;
            return targetElement.getAttribute(attribute) || "";
        }
        return "";
    };
    
    const getMetaAttributes = (selectors, attribute, childSelector) => {
        let values = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                values = Array.from(elements).map(element => {
                    const targetElement = childSelector ? element.querySelector(childSelector) : element;
                    return targetElement.getAttribute(attribute);
                });
                break; // Прерываем цикл после первого успешного поиска
            }
        }
        // if (values.length === 0) {
        //     return "";
        // }
        return values.join('; ');
    };

    function getTextFromElementWithoutSpan(elem) {
        let text = '';
        elem.childNodes?.forEach(node => {
            if (node.nodeName !== 'SPAN') {
                text += node.textContent;
            }
        });
        return text.trim();
    }

    function romanToNumberOrReturn(input) {
        const romanNumerals = {
            'I': 1,
            'V': 5,
            'X': 10,
            'L': 50,
            'C': 100,
            'D': 500,
            'M': 1000,
            'i': 1,
            'v': 5,
            'x': 10,
            'l': 50,
            'c': 100,
            'd': 500,
            'm': 1000

        };
    
        // Проверка, является ли входное значение римской цифрой
        function isRoman(input) {
            return /^[IVXLCDMivxlcdm]+$/i.test(input);
        }
    
        // Если входное значение не является римской цифрой, возвращаем его без изменений
        if (!isRoman(input)) {
            return input;
        }
    
        let result = 0;
        let prevValue = 0;
    
        // Преобразование римской цифры в число
        for (let i = input.length - 1; i >= 0; i--) {
            let currentValue = romanNumerals[input[i]];
    
            if (currentValue < prevValue) {
                result -= currentValue;
            } else {
                result += currentValue;
            }
    
            prevValue = currentValue;
        }
    
        // Преобразование числа в строку и возвращение результата
        return result.toString();
    }

    function getMFDict(){
        let scriptElement = document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)');
        let scriptText = scriptElement.textContent;
        let dictionary = xplGlobal.document.metadata;
        return dictionary
    }
    let mf_dict = getMFDict();

    // let title = getMetaAttributes(['meta[name="citation_title"]'], 'content')
    // if (title == ""){
    //     title = document.querySelector('.chapter-title')? document.querySelector('.chapter-title').innerText.trim() : "";
    // }

    let date = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Copyright Year: (\d{4})/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Copyright Year: (\d{4})/)[1] : "" : "";
    if (date == ""){
        date = mf_dict["copyrightYear"] || mf_dict["publicationYear"] ||  ""
        //date = document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)')? document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)').innerText.match(/"copyrightYear":"(\d{4})"/)? document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)').innerText.match(/"copyrightYear":"(\d{4})"/)[1] : "" : "";
    }
    if (date.length == 4){
        date = `${date}-01-01`;
    }

    let authors = Array.from(document.querySelectorAll('meta[name="parsely-author"]')).map(elem => elem.content.trim().replace(";", "")).join("; ")
    if (authors == ""){
        let rawAuthors = document.querySelector('.authors-info-container')?document.querySelector('.authors-info-container').innerText : "";
        if (!rawAuthors.includes("Editor")){
            authors = Array.from(document.querySelectorAll('.authors-info')).map(elem => elem.innerText.trim().replace(";", "")).join("; ")
        }
        if (authors == ""){
            mf_dict.author?.forEach(function(author, index) {
                // Проверяем, есть ли у автора аффиляции
                if (author?.name?.length > 0) {
                    // Добавляем в переменную affiliations имя автора и его аффиляции в нужном формате
                    authors += author.name;
                    // Добавляем ";;" после каждого автора, кроме последнего
                    if (index !== mf_dict.author.length - 1) {
                        authors += '; ';
                    }
                }
            });
        }
    }
    let author_aff = "";
    mf_dict.author?.forEach(function(author, index) {
        // Проверяем, есть ли у автора аффиляции
        if (author?.affiliation?.length > 0) {
            // Добавляем в переменную affiliations имя автора и его аффиляции в нужном формате
            author_aff += author.name + ":" + author.affiliation.join('!');
            // Добавляем ";;" после каждого автора, кроме последнего
            if (index !== mf_dict.author.length - 1) {
                author_aff += ";; ";
            }
        }
    });

    let editors = ""
    mf_dict.editor?.forEach(function(editor, index) {
        // Проверяем, есть ли у автора аффиляции
        if (editor?.name?.length > 0) {
            // Добавляем в переменную affiliations имя автора и его аффиляции в нужном формате
            editors += editor.name;
            // Добавляем ";;" после каждого автора, кроме последнего
            if (index !== mf_dict.editor.length - 1) {
                editors += '; ';
            }
        }
    });
    let editors_aff = ""
    mf_dict.editor?.forEach(function(editor, index) {
        // Проверяем, есть ли у автора аффиляции
        if (editor?.affiliation?.length > 0) {
            // Добавляем в переменную affiliations имя автора и его аффиляции в нужном формате
            editors_aff += editor.name + ":" + editor.affiliation.join('!');
            // Добавляем ";;" после каждого автора, кроме последнего
            if (index !== mf_dict.editor.length - 1) {
                editors_aff += ";; ";
            }
        }
    });

    let mf_doi = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/DOI: (10.*)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/DOI: (10.*)/)[1] : "" : "";
    if (mf_doi == ""){
        mf_doi = mf_dict["doi"] || "";
    }

    //let full_book_name_node = document.querySelector('.book-info__title');
    let mf_book = document.querySelector('.document-title')? document.querySelector('.document-title').innerText.trim() : "";
    if (mf_book == ""){
        mf_book = document.querySelector('meta[property="og:title"]')? document.querySelector('meta[property="og:title"]').content.trim() : "";
    }

    let printIsbnObj = mf_dict.isbn.find(function(isbnObj) {
        return isbnObj.format === "Print ISBN";
    });
    let mf_isbn = printIsbnObj?.value || "";
    if (mf_isbn == ""){
        mf_isbn = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Print ISBN: ([0-9-]+)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Print ISBN: ([0-9-]+)/)[1] : "" : "";
    }
    
    eIsbnObj = mf_dict.isbn.filter(function(isbnObj) {
        return isbnObj.format == "Online ISBN" || isbnObj.format == "Electronic ISBN";
    });
    let mf_eisbn = eIsbnObj.map(elem => elem.value).join(";") || "";
    if (mf_eisbn == ""){
        mf_eisbn = Array.from(document.querySelectorAll('.row.g-0.u-pt-1 .abstract-metadata-indent div')).filter(isbn => isbn.innerText.includes("Online ISBN") || isbn.innerText.includes("Electronic ISBN")).map(isbn => isbn.innerText.replaceAll("Online ISBN: ", "").replaceAll("Electronic ISBN: ", "")).join(";")
        if (mf_eisbn){
            mf_eisbn = Array.from(document.querySelectorAll('.row.g-0.u-pt-1 .u-pb-1')).filter(isbn => isbn.innerText.includes("Online ISBN") || isbn.innerText.includes("Electronic ISBN")).map(isbn => isbn.innerText.replaceAll("Online ISBN:", "").replaceAll("Electronic ISBN:", "").trim()).join(";")
        }
    }

    // let mf_issn = "";
    // let printIssn = Array.from(document.querySelectorAll('.book-info__isbn')).map(elem => elem.innerText).filter(elem => elem.includes("Print ISSN:"))
    // if (printIssn.length > 0){
    //     mf_issn = printIssn[0].replace("Print ISSN:", "").trim();
    // }
    
    let publisher = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Book Type: (.*)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Book Type: (.*)/)[1].trim() : "" : "";
    if (publisher == ""){
        publisher = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Publisher: (.*)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Publisher: (.*)/)[1].trim() : "" : "";
        if (publisher == ""){
            publisher = mf_dict["publisher"] || mf_dict["bookType"] || "";
        }
    }
    // const volume = document.querySelector('.book-info__volume-number')? document.querySelector('.book-info__volume-number').innerText.trim(): "";
    // let first_page = document.querySelector('#getCitation')? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)[1] : "" : "";
    // if (first_page == ""){
    //     first_page = document.querySelector('.chapter-pagerange-value')? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)[1] : "" : "";
    // }
    // let last_page = document.querySelector('#getCitation')? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)[2] : "" : "";
    // if (last_page == ""){
    //     last_page = document.querySelector('.chapter-pagerange-value')? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)[2] : "" : "";
    // }
    let pages = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Pages: (\d+)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Pages: (\d+)/)[1] : "" : "";
    if (pages == ""){
        pages = mf_dict["pages"] || ""
    }
    const type = "book"
    // let editorsArray = Array.from(document.querySelectorAll('.book-info__authors .al-authors-list.editors .linked-name')).map(elem => elem.innerText.trim())
    // let editors = Array.from([...new Set(editorsArray)]).join('; ')
    // let raw_editors_aff = Array.from(document.querySelectorAll('.book-info__authors .editors .al-author-name .info-card-author'))
    // .filter(elem => {
    //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
    //     let affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim() : "";
    //     return author != "" && affilation.length != "";
    // })
    // .map(elem => {
    //     let author = elem.querySelector('.info-card-name').innerText.trim();
    //     let affilation = Array.from(elem.querySelectorAll('.aff'))
    //         .map(divAff => Array.from(divAff.querySelectorAll('div, a')).map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ")).join("!");
    //     if (affilation == ""){
    //         affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '') : "";
    //     }
    //     return `${author}:${affilation}`;
    // })
    // let editors_aff = Array.from([...new Set(raw_editors_aff)]).join(";; ");

    // let language = document.querySelector('script[type="application/ld+json"]')? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)[1] : "" : "";
    // if (language == "en"){
    //     language = "eng";
    // }
    // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
    //let rawKeywords =Array.from(document.querySelectorAll('#keywords_list .intent_text')).map(elem => elem.innerText.replaceAll(",", "").trim())
    let keywords = "";
    if (mf_dict.keywords && mf_dict.keywords[0] && mf_dict.keywords[0].kwd) {
        keywords = mf_dict.keywords[0].kwd.join(";");
    }
    if (keywords == ""){
        keywords = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Topics: (.*)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Topics: (.*)/)[1].trim() : "" : "";
        if (keywords == ""){
            keywords = mf_dict["topics"] || ""
        }  
    } 
    //ABSTRACT
    // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
    // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    // const abstractTexts = [];
    // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
    //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
    // }
    // const abstract = abstractTexts.join(' ') || "";
    const abstract = mf_dict["abstract"]?.replaceAll(/<[^>]+>/g, '') || ""
    // let raw_affiliation = Array.from(document.querySelectorAll('.wi-authors .info-card-author'))
    // .filter(elem => {
    //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
    //     let affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim() : "";
    //     return author != "" && affilation.length != "";
    // })
    // .map(elem => {
    //     let author = elem.querySelector('.info-card-name').innerText.trim();
    //     let affilation = Array.from(elem.querySelectorAll('.aff'))
    //         .map(divAff => Array.from(divAff.querySelectorAll('div, a')).map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ")).join("!");
    //     if (affilation == ""){
    //         affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '') : "";
    //     }
    //     return `${author}:${affilation}`;
    // })
    // let affiliation = Array.from([...new Set(raw_affiliation)]).join(";; ");

    // let raw_book_author_affiliation = Array.from(document.querySelectorAll('.wi-authors .info-card-author'))
    // .filter(elem => {
    //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
    //     let affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim() : "";
    //     return author != "" && affilation.length != "";
    // })
    // .map(elem => {
    //     let author = elem.querySelector('.info-card-name').innerText.trim();
    //     let affilation = Array.from(elem.querySelectorAll('.aff'))
    //         .map(divAff => Array.from(divAff.querySelectorAll('div, a')).map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ")).join("!");
    //     if (affilation == ""){
    //         affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '') : "";
    //     }
    //     return `${author}:${affilation}`;
    // })
    // let book_author_affiliation = Array.from([...new Set(raw_book_author_affiliation)]).join(";; ");

    // if (affiliation == "" && authors == bookAuthors){
    //     affiliation = book_author_affiliation;
    // }

    // let orcidsRaw = Array.from(document.querySelectorAll('.wi-authors .info-card-author'))
    // .filter(elem => {
    //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
    //     let orcid = elem.querySelector('.info-card-location')? elem.querySelector('.info-card-location').innerText.trim() : "";
    //     return author != "" && orcid.length != "" && orcid.includes("orcid.org");
    // })
    // .map(elem => {
    //     let author = elem.querySelector('.info-card-name').innerText.trim();
    //     let orcid = Array.from(elem.querySelectorAll('.info-card-location'))
    //         .map(orc => orc.innerText.trim()).join("!");
    //     return `${author}::${orcid}`;
    // })
    // let orcids = Array.from([...new Set(orcidsRaw)]).join(";; ");

    //Type
    // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');

    var metadata = { '200': authors, '203': date, '81': abstract, '240': mf_isbn, '241': mf_eisbn, '201': keywords, '239': type, '235': publisher, '144': author_aff, '242': mf_book, '193': pages, '233': mf_doi, '207': editors, '146': editors_aff};
    // log(`Data extracted from ${url}`);
    // log(`Metadata: ${JSON.stringify(metadata)}`);
    return metadata;
};