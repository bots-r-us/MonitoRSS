const express = require('express')
const feeds = express.Router()
const getArticles = require('../../../rss/getArticle.js')
const config = require('../../../config.js')
const Article = require('../../../structs/Article.js')
const ArticleIDResolver = require('../../../structs/ArticleIDResolver.js')
const axios = require('axios')
const log = require('../../../util/logger.js')
// const feedsJson = require('../../tests/files/feeds.json')
const rateLimit = require('express-rate-limit')
if (process.env.NODE_ENV !== 'test') {
  feeds.use(rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20, // 20 requests per 1 minute
    message: {
      code: 429,
      message: 'Too many requests'
    }
  }))
}

async function validUrl (req, res, next) {
  const feedUrl = req.params.url
  if (!feedUrl) return res.status(400).json({ code: 400, message: 'No url in param specified' })
  if (feedUrl.includes('feed43.com')) return res.status(403).json({ code: 403, message: 'feed43 feeds are forbidden' })
  next()
}

async function getUrl (req, res, next) {
  try {
    const feedUrl = req.params.url
    const mockGuildRss = { sources: { someName: { link: feedUrl } } }
    let rawArticleList = []
    let xmlStr = ''
    try {
      [ , , rawArticleList ] = await getArticles(mockGuildRss, 'someName')
    } catch (err) {
      if (err.message.includes('No articles in feed')) return res.json(rawArticleList)
      else return res.status(500).json({ code: 500, message: err.message })
    }

    try {
      xmlStr = (await axios.get(feedUrl)).data
    } catch (err) {
      const errMessage = err.response && err.response.data && err.response.data.message ? err.response.data.message : err.response && err.response.data ? err.response.data : err.message
      log.web.warning('Failed to get feed XML - ' + errMessage)
      return res.status(500).json({ code: 500, message: errMessage })
    }
    const allPlaceholders = []
    const idResolver = new ArticleIDResolver()
    for (const article of rawArticleList) idResolver.recordArticle(article)
    for (const article of rawArticleList) {
      const parsed = new Article(article, {}, {
        timezone: config.feeds.timezone,
        format: config.feeds.dateFormat,
        language: config.feeds.dateLanguage
      })
      const articlePlaceholders = {}
      const useIdType = idResolver.getIDType()
      for (const placeholder of parsed.placeholders) {
        articlePlaceholders[placeholder] = parsed[placeholder]
        articlePlaceholders._id = ArticleIDResolver.getIdTypeValue(parsed.raw, useIdType)
      }

      allPlaceholders.push(articlePlaceholders)
    }
    res.json({ placeholders: allPlaceholders, xml: xmlStr })
  } catch (err) {
    next(err)
  }
}

feeds.get('/:url', getUrl)

module.exports = {
  middleware: {
    validUrl
  },
  routes: {
    getUrl
  },
  router: feeds
}
