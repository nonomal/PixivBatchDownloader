// 初始化小说搜索页
import { InitPageBase } from '../crawl/InitPageBase'
import { Colors } from '../config/Colors'
import { lang } from '../Lang'
import { options } from '../setting/Options'
import { SearchOption } from '../crawl/CrawlArgument'
import { filter, FilterOption } from '../filter/Filter'
import { API } from '../API'
import { store } from '../store/Store'
import { log } from '../Log'
import { FastScreen } from '../pageFunciton/FastScreen'
import { Tools } from '../Tools'
import { BookmarkAllWorks } from '../pageFunciton/BookmarkAllWorks'
import { Utils } from '../utils/Utils'
import { idListWithPageNo } from '../store/IdListWithPageNo'

class InitSearchNovelPage extends InitPageBase {
  constructor() {
    super()
    this.init()
  }

  private readonly worksWrapSelector = '#root section>div>ul'

  private option: SearchOption = {}
  private readonly worksNoPerPage = 24 // 每个页面有多少个作品
  private needCrawlPageCount = 0 // 一共有有多少个列表页面
  private sendCrawlTaskCount = 0 // 已经抓取了多少个列表页面
  private readonly allOption = [
    'order',
    'type',
    'wlt',
    'wgt',
    'hlt',
    'hgt',
    'ratio',
    'tool',
    's_mode',
    'mode',
    'scd',
    'ecd',
    'blt',
    'bgt',
    'tlt',
    'tgt',
    'original_only',
    'work_lang',
  ]

  private readonly flag = 'searchNovel'

  protected initAny() {
    new FastScreen()
  }

  protected addCrawlBtns() {
    Tools.addBtn('crawlBtns', Colors.bgBlue, lang.transl('_开始抓取'), [
      ['title', lang.transl('_开始抓取') + lang.transl('_默认下载多页')],
    ]).addEventListener('click', () => {
      this.readyCrawl()
    })
  }

  private getWorksWrap() {
    const test = document.querySelectorAll(this.worksWrapSelector)
    if (test.length > 0) {
      // 小说页面用这个选择器，只匹配到了一个 ul
      return test[test.length - 1] as HTMLUListElement
    }
    return null
  }

  protected addAnyElement() {
    // 添加收藏本页所有作品的功能
    const bookmarkAllBtn = Tools.addBtn(
      'otherBtns',
      Colors.bgGreen,
      lang.transl('_收藏本页面的所有作品')
    )
    const bookmarkAll = new BookmarkAllWorks(bookmarkAllBtn)

    bookmarkAllBtn.addEventListener('click', () => {
      const listWrap = this.getWorksWrap()
      if (listWrap) {
        const list = document.querySelectorAll(
          '#root section>div>ul>li'
        ) as NodeListOf<HTMLLIElement>
        const showList = Array.from(list).filter((el) => {
          return el.style.display !== 'none'
        })
        bookmarkAll.sendWorkList(showList)
      }
    })
  }

  protected setFormOption() {
    // 个数/页数选项的提示
    options.setWantPageTip({
      text: lang.transl('_页数'),
      tip: lang.transl('_从本页开始下载提示'),
      rangTip: `1 - ${this.maxCount}`,
    })
  }

  protected async nextStep() {
    this.initFetchURL()

    this.needCrawlPageCount = await this.calcNeedCrawlPageCount()

    if (this.needCrawlPageCount === 0) {
      return this.noResult()
    }

    this.startGetIdList()
  }

  protected getWantPage() {
    this.crawlNumber = this.checkWantPageInput(
      lang.transl('_从本页开始下载x页'),
      lang.transl('_下载所有页面')
    )

    if (this.crawlNumber === -1 || this.crawlNumber > this.maxCount) {
      this.crawlNumber = this.maxCount
    }
  }

  // 获取搜索页的数据。因为有多处使用，所以进行了封装
  private async getSearchData(p: number) {
    let data = await API.getNovelSearchData(store.tag, p, this.option)
    return data.body.novel
  }

  // 组织要请求的 url 中的参数
  private initFetchURL() {
    let p = Utils.getURLSearchField(location.href, 'p')
    this.startpageNo = parseInt(p) || 1

    // 从页面 url 中获取可以使用的选项
    this.option = {}
    this.allOption.forEach((param) => {
      let value = Utils.getURLSearchField(location.href, param)
      if (value !== '') {
        this.option[param] = value
      }
    })

    // 如果没有指定搜索模式，则是精确匹配标签，设置对应的值
    if (this.option.s_mode === undefined) {
      this.option.s_mode = 's_tag_full'
    }
  }

  // 计算应该抓取多少页
  private async calcNeedCrawlPageCount() {
    let data = await this.getSearchData(1)
    // 计算总页数
    let pageCount = Math.ceil(data.total / this.worksNoPerPage)
    if (pageCount > this.maxCount) {
      // 最大为 1000
      pageCount = this.maxCount
    }
    // 计算从本页开始抓取的话，有多少页
    let needFetchPage = pageCount - this.startpageNo + 1
    // 比较用户设置的页数，取较小的那个数值
    if (needFetchPage < this.crawlNumber) {
      return needFetchPage
    } else {
      return this.crawlNumber
    }
  }

  // 计算页数之后，准备建立并发抓取线程
  private startGetIdList() {
    if (this.needCrawlPageCount <= this.ajaxThreadsDefault) {
      this.ajaxThread = this.needCrawlPageCount
    } else {
      this.ajaxThread = this.ajaxThreadsDefault
    }

    for (let i = 0; i < this.ajaxThread; i++) {
      this.getIdList()
    }
  }

  // 仅当出错重试时，才会传递参数 p。此时直接使用传入的 p，而不是继续让 p 增加
  protected async getIdList(p?: number): Promise<void> {
    if (p === undefined) {
      p = this.startpageNo + this.sendCrawlTaskCount
      this.sendCrawlTaskCount++
    }

    // 发起请求，获取列表页
    let data
    try {
      data = await this.getSearchData(p)
    } catch {
      return this.getIdList(p)
    }

    data = data.data
    for (const nowData of data) {
      const filterOpt: FilterOption = {
        createDate: nowData.createDate,
        id: nowData.id,
        bookmarkData: nowData.bookmarkData,
        bookmarkCount: nowData.bookmarkCount,
        workType: 3,
        tags: nowData.tags,
        userId: nowData.userId,
        xRestrict: nowData.xRestrict,
      }

      if (await filter.check(filterOpt)) {
        idListWithPageNo.add(
          this.flag,
          {
            type: 'novels',
            id: nowData.id,
          },
          p
        )
      }
    }

    this.listPageFinished++

    log.log(
      lang.transl('_列表页抓取进度', this.listPageFinished.toString()),
      1,
      false
    )

    if (this.sendCrawlTaskCount + 1 <= this.needCrawlPageCount) {
      // 继续发送抓取任务（+1 是因为 sendCrawlTaskCount 从 0 开始）
      this.getIdList()
    } else {
      // 抓取任务已经全部发送
      if (this.listPageFinished === this.needCrawlPageCount) {
        // 抓取任务全部完成
        log.log(lang.transl('_列表页抓取完成'))

        idListWithPageNo.store(this.flag)

        this.getIdListFinished()
      }
    }
  }

  protected resetGetIdListStatus() {
    this.listPageFinished = 0
    this.sendCrawlTaskCount = 0
  }

  // 搜索页把下载任务按收藏数从高到低下载
  protected sortResult() {
    store.resultMeta.sort(Utils.sortByProperty('bmk'))
    store.result.sort(Utils.sortByProperty('bmk'))
  }
}

export { InitSearchNovelPage }
