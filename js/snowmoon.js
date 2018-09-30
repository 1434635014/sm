
(function( global, factory ) {
    "use strict";
    if ( typeof module === "object" && typeof module.exports === "object" ) {
        module.exports = global.document ?
            factory( global, true ) :
            function( w ) {
                if ( !w.document ) {
                    throw new Error( "SM requires a window with a document" );
                }
                return factory( w );
            };
    } else {
        factory( global );
    }
}(typeof window !== "undefined" ? window : this, function(window) {
    /**
     * All configuration parameters
     */
    var _reg = {                        //all regular expression
            braceReg: /\{\{(.*)\}\}/,
            smReg: /^(sm\-)|(\:)|(\@)/
        },
        _newArrProto = [],              //all array proto methods of listen list
        _version = {},                  //the list version
        _listName = 'list',             //the for of list name
        _listItemName = 'item',         //the for of item name
        _listKeyName = 'key',           //the for of key name
        _listIndexName = 'index',       //the for of index name
        _depName = '__dep__',           //the dep name of array prototype
        _type = {                       //the configuration of attribute name for it meaning
            'sm-text': 'text',
            'sm-model': 'input',
            'sm-on': 'event',
            'sm-bind': 'bind',
            'sm-for': 'for',
            'sm-html': 'html',
            'sm-if': 'if',
            'sm-show': 'show'
        },
        _queueScan = [],               //the queue of scan views
        _swich = {                    //the switch of extend
            isWatchNewValue: false,      //是否开启对新值的向下监听
        }


    /**
     * Get hash of list
     */
    var getHash = (function () {
        var hash = 0;
        return function () {
            return hash++
        }
    })()

    /**
     *  Add event of element
     */
    function addEvent(eles, type, handler) {
        if(eles.length){
            for(var j = 0; j < eles.length; j++) setEvent(eles[j])
        }else setEvent(eles);
        function setEvent(ele) {
            if(ele.addEventListener){
                ele.addEventListener(type, handler, false)
            }else if(ele.attachEvent){
                ele.attachEvent('on'+type, handler)
            }else{
                return false;
            }
        }
    };
    /**
     * Check whether the element exists in this class
     */
    function hasClass(obj, cls) {
      return obj.className.match(new RegExp('(\\s|^)' + cls + '(\\s|$)'))
    }

    /**
     * Add class to the element
     */
    function addClass(obj, cls) {
      if (!hasClass(obj, cls)) obj.className += " " + cls;
    }

    /**
     * Remove class from the element
     */
    function removeClass(obj, cls) {
      if (hasClass(obj, cls)) {
        var reg = new RegExp('(\\s|^)' + cls + '(\\s|$)')
        obj.className = obj.className.replace(reg, '');
      }
    }

    /**
     * Remove all spaces in a string
     */
    function trimAll (str) {
        return str.replace(/\s/g, '')
    }

    /**
     * Convert a non - quoted string into an object
     */
    function strToObj (str) {
        return JSON.parse(trimAll(str).replace(/^\{/g, '{"').replace(/\}$/g, '"}').replace(/\:/g, '":"').replace(/\,/g, '","'))
    }
    
    function newObj (obj) {
        if(typeof obj === 'object'){
          if(obj.length >= 0)
            return obj.concat()
          else
            return JSON.parse(JSON.stringify(obj))
        }else return obj
    }

    /**
     * Not type checking this file because flow doesn't play well with
     * Dynamically accessing methods on Array prototype
     */
    [
        'push',
        'pop',
        'shift',
        'unshift',
        'splice',
        'sort',
        'reverse'
    ].forEach(function(method){
        var original = Array.prototype[method];
        _newArrProto[method] = function mutator() {
            var length = original.apply(this, arguments)
            this[_depName].notify();
            return length;
        }
    })

    /**
     * Compile the node
      * @param _sm The SnowMoon
     * @param ofTemplate The element is for list
     * @returns {boolean} Does it continue to compile internally
     */
    function compile(node, _sm, ofTemplate){
        var isKeepOnScan = true
        if(node.nodeType === 1){            //element
            node.tagName.toLowerCase()
            var attr = node.attributes;
            for(var i = 0; i < attr.length; i++){
                var name = (attr[i].nodeName).trim()
                var str = (attr[i].nodeValue).trim()
                if(_reg.smReg.test(name)){
                    node.removeAttribute(name)
                    i--
                    var tVal, isHas = name.indexOf(':') !== -1? 0 : name.substring(0, 1) === '@'? 1 : -1
                    if(isHas!==-1){               //has :
                        var arr = isHas === 0? name.split(':') : name.split('@')
                        if((tVal = _type[arr[0]]) === 'event' || isHas === 1){ //event
                            _sm.render = createFunction(getEventRender(str))
                            var callback =  _sm.render();
                            addEvent(node, arr[1], function (e) {
                                callback.call(_sm, e)
                            })
                        }else if(tVal === 'bind' || arr[0] === ''){
                            if(arr[1] === 'style' || arr[1] === 'class'){           //class or style
                                var obj = strToObj(str)
                                for(key in obj){
                                    new Watcher({ _sm: _sm, node: node, ofTemplate: ofTemplate, type: 'bind', bindType :arr[1],  key: obj[key], bindName: key })
                                }
                            }else{                                                  //attribute
                                new Watcher({ _sm: _sm, node: node, ofTemplate: ofTemplate, type: 'bind', bindType :'attr',  key: str, bindName: arr[1] })
                            }
                        }
                    }else{
                        if(tVal = _type[name]){
                            var key = trimAll(str);
                            if(tVal === 'for') {
                                if (ofTemplate && _version[ofTemplate[ofTemplate.length-1].versionKey]){
                                    key = compilerCode(key)
                                }
                                _queueScan.push({_sm: _sm, node: node, key: key, ofTemplate: ofTemplate, type: tVal})
                                isKeepOnScan = false
                            }else if(tVal === 'input'){
                                addEvent(node, tVal, function (e) {
                                    _sm[key] = e.target.value;
                                })
                            }else{
                                new Watcher({_sm: _sm, node: node, key: key, ofTemplate: ofTemplate, type: tVal})
                            }
                        }
                    }
                }
            }
        }else if(node.nodeType === 3){      //text
            if(_reg.braceReg.test(node.nodeValue)){                     //text {{}}
                str = RegExp.$1.trim()
                var key = trimAll(str)
                node.nodeValue = _sm[key]

                new Watcher({  _sm: _sm, node: node, key: key, ofTemplate: ofTemplate, type: '{{}}' })
            }
        }
        return isKeepOnScan
    }
    /**
     * view scan
     */
    function viewScan(nodes, _sm, ofTemplate, isOut){
        if(isOut) compile(nodes, _sm, ofTemplate)
        for(var i = 0; i < nodes.childNodes.length; i++) {
            if(Dep.listLength && !Dep.listInfo){             //if scan list
                i += Dep.listLength - 1
                Dep.listLength = null
            }
            if(compile(nodes.childNodes[i], _sm, ofTemplate)) viewScan(nodes.childNodes[i], _sm, ofTemplate)
        }
    }
    /**
     * watchNode
     */
    function watchSM(_sm, object, key, value, isForItemKeys) {
        var dep = new Dep(), info = objInfo(value), itemKey;
        // isForItemKeys = isForItemKeys ? isForItemKeys.concat() : [];  isForItemKeys.push(key)
        isForItemKeys = isForItemKeys ? isForItemKeys.concat() : []

        if(isForItemKeys.length > 0)
            itemKey = typeof key === 'number'? isForItemKeys[isForItemKeys.length-1]+'['+key +']':isForItemKeys[isForItemKeys.length-1]+'.'+key
        else itemKey = key
        isForItemKeys.push(itemKey)

        if(info === 1)  {                   //array
            value[_depName] = new Dep()
            value.__proto__ = _newArrProto
            for(var i = 0; i < value.length; i++) watchSM(_sm, value, i, value[i], isForItemKeys)
        }
        if(info === 2) {                    //object
            for(var _key in value) watchSM(_sm, value, _key, value[_key], isForItemKeys)
        }

        Object.defineProperty(object, key, {
            enumerable: true,
            configurable: true,
            set: function setter(newVal) {
                if(newVal === value) return
                if(_swich.isWatchNewValue) info = objInfo(newVal)

                if(info === 1) {                    //array
                    newVal[_depName] = value[_depName]
                    newVal.__proto__ = _newArrProto
                }
                value = newVal
                if(info === 1) for(var i = 0; i < value.length; i++) watchSM(_sm, value, i, value[i], isForItemKeys)
                if(info === 2) for(var _key in value) watchSM(_sm, value, _key, value[_key], isForItemKeys)

                if(info===1||info===2) Dep.isForItemKeys = isForItemKeys;
                dep.notify(newVal, info===1||info===2)
                queueScan()
                Dep.isForItemKeys = null;
            },
            get: function getter() {
                if (Dep.watcher) {
                    //if has same data in the string
                    if((Dep.lastHash === Dep.hash && Dep.getValList.indexOf(itemKey) !== -1)                    //通过单次的getVal添加hash，以防在同一个getVal中出现多个不必要的观察者
                        || (typeof Dep.saveTemplate === 'object') && Dep.saveTemplate.indexOf(itemKey) !== -1)
                        return value

                    /**
                     * 控制对象之下的for循环内容，造成for循环本身或之上的对象添加过多观察者，Dep.saveTemplateKey表示在该for循环的对象上，才保存，而不是在第一个对象就保存
                     */
                    if (Dep.saveTemplate === true) {
                        if (Dep.saveTemplateKey === itemKey) Dep.saveTemplate = isForItemKeys
                        else{
                            if (Dep.isForFor) {
                                //该isForForTo表示，如果已经到达了上一个for循环的位置，就停下来，之后的东西又需要添加观察者了
                                if (!Dep.isForForTo) {
                                    if (Dep.isForFor === itemKey) Dep.isForForTo = true                            //如果该for是属于另一个for循环，那么。除了上一个for循环本身以及它之前的东西都不需要添加观察者
                                    return value
                                }
                            }
                        }
                    }

                    if (Dep.isForItemKeys && Dep.isForItemKeys.indexOf(itemKey) !== -1) return value                    //在改变值之后，本值或之上的对象都不需要添加新的观察者)

                    dep.addWatch(Dep.watcher)
                    if(info === 1) value[_depName].addWatch(Dep.watcher)

                    if(Dep.lastHash !== Dep.hash) Dep.lastHash = Dep.hash
                    Dep.getValList.push(itemKey)
                }
                return value
            }
        })
    }

    /**
     * get render
     */
    function getRender (code) {
        return  ('with(this){return ' + compilerCode(code) + '}')
    }
    /**
     * get event render
     */
    function getEventRender (code) {
        return  ('with(this){ return function($event){' + compilerCode(code) + '} }')
    }

    /**
     * compiler code
     */
    function compilerCode (code) {
        if(Dep.listInfo){
            code = code.replace(new RegExp('(\\$'+_listItemName+'){1}', 'g'), Dep.listInfo.listKey+'['+Dep.listInfo.indexOfKey+']')
            code = code.replace(new RegExp('(\\$'+Dep.listInfo.indexOfKeyName+'){1}', 'g'), '"'+Dep.listInfo.indexOfKey+'"')
            code = code.replace(new RegExp('(\\$'+_listName+'){1}', 'g'), Dep.listInfo.listKey)
        }
        return code
    }

    /**
     * create function of render
     */
    function createFunction (render) {
        try {
            return new Function(render)
        } catch (err) {
            console.log(err)
        }
    }

    /**
     * get object info of array or object
     */
    function objInfo(obj) {
        if(typeof obj === 'object')
            if(obj.length)
                return 1
            else
                return 2
        else return 0
    }

    /**
     * compare a or b is strict equality
     */
    function compare(a, b) {
        if((typeof a !== 'object' && a === b) || (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b))) return true; else return false
    }
    
    /*------------------------------Dep------------------------------*/
    function Dep() {
        this.watchers = []
    }
    Dep.prototype = {
        addWatch: function (watcher) {
            this.watchers.push(watcher)
        },
        notify: function (newVal, isObj) {
            console.log(this.watchers)
            var deleteW = []
            this.watchers.forEach(function (watcher, i) {
                if(watcher.isExpire()){                 //if of list and watcher is expire
                    deleteW.push(i)                     //delete watcher of watchers
                } else {
                    if(watcher.update) watcher.update(isObj); else watcher(newVal, watcher.originalVal);
                }             //update view
            })
            if(deleteW.length > 0){                 //delete watchers
                this.watchers = this.watchers.filter(function (v, i) {
                    return deleteW.indexOf(i) === -1
                })
            }
            console.log(this.watchers)
        },
        getSize: function () {
            return this.watchers.length
        }
    }

    /*------------------------------Watcher------------------------------*/
    function Watcher(option) {
        Dep.watcher = this
        this._sm = option._sm
        this.key = option.key
        this.node = option.node
        this.type = option.type
        this.parentNode = option.node.parentNode
        this.nextSibling = option.node.nextSibling
        this.listNodes = null
        if(option.ofTemplate) {
            this.ofTemplate = option.ofTemplate
            this.version =  this.getLastVerOf().version || 0;
        }
        if(option.type === 'bind'){
            this.bindType = option.bindType
            this.bindName = option.bindName
        }
        this.code = getRender(this.key)
        this.render = createFunction(this.code);
        this.update = this.update()
        this.update(null, true)
        Dep.watcher = null
    }
    Watcher.prototype = {
        update: function () {
            var _sm = this._sm, node = this.node, key = this.key, isTrue = undefined
            switch (this.type) {
                case '{{}}':                        //{{}}
                    return function (isObj) {
                        this.getVal(isObj)
                        node.nodeValue = this.value
                    }
                case 'text':                        //text
                    return function (isObj) {
                        this.getVal(isObj)
                        node.innerText = this.value
                    }
                case 'bind':                        //bind
                    if (this.bindType === 'class') {                        //class
                        return function (isObj) {
                            this.getVal(isObj)
                            if (this.value !== isTrue || isTrue === undefined) {
                              if (this.value) {
                                addClass(node, this.bindName)
                                isTrue = true
                              } else {
                                removeClass(node, this.bindName)
                                isTrue = false
                              }
                            }
                        }
                    } else if (this.bindType === 'style') {                 //style
                        return function (isObj) {
                            this.getVal(isObj)
                            node.style[this.bindName] = this.value
                        }
                    } else if (this.bindType === 'attr') {                  //attribute
                        return function (isObj) {
                            this.getVal(isObj)
                            node.setAttribute(this.bindName, this.value)
                        }
                    }
                case 'if':                        //if
                    return function (isObj) {
                        this.getVal(isObj)
                        if(this.value !== isTrue || isTrue === undefined){
                          if(this.value){
                            if(isTrue === undefined) viewScan(node, _sm)
                            isTrue = true
                            this.parentNode.insertBefore(node, this.nextSibling)
                          }else{
                            this.parentNode.removeChild(node)
                            isTrue = false
                          }
                        }
                    }
                case 'show':                        //show
                    return function (isObj) {
                        this.getVal(isObj)
                        if(this.value !== isTrue || isTrue === undefined){
                          if(this.value){
                            node.style.display = 'block'
                            isTrue = true
                          }else{
                            node.style.display = 'none'
                            isTrue = false
                          }
                        }
                    }
                case 'input':                       //input
                    return function (isObj) {
                        this.getVal(isObj)
                        node.value = this.value
                    }
                case 'html':                        //html
                    return function (isObj, isFirst) {
                        Dep.saveTemplate = true
                        Dep.saveTemplateKey = key

                        if(this.ofTemplate)                                             //该html是否属于另一个html循环中，前提是第一次或者已经有ifForFor设定的情况下
                            if (isFirst) Dep.isForFor = this.isForFor = this.ofTemplate.pushList[this.ofTemplate.pushList.length-1]

                        this.getVal(isObj)

                        Dep.isForFor = false
                        Dep.isForForTo = false

                        if (isFirst){
                            if (this.isForFor)
                                this.versionKey = addVersion(key, this.ofTemplate[this.ofTemplate.length-1].versionKey)
                            else
                                this.versionKey = addVersion(key)
                            this.version = 0
                        }else this.version = versionAdd(this.versionKey)

                        node.innerHTML = this.value

                        if(isFirst) this.pushOfKey()                                    //只有第一次才添加新的版本key
                        viewScan(node, _sm, this.ofTemplate)

                        Dep.saveTemplate = false
                        Dep.saveTemplateKey = null
                        Dep.isForFor = false
                    }
                case 'for':                         //for

                    return function (isObj, isFirst) {
                        Dep.saveTemplate = true
                        Dep.saveTemplateKey = key

                        if(this.ofTemplate)                                           //该for循环是否属于另一个for循环中，前提是第一次或者已经有ifForFor设定的情况下
                            if (isFirst) Dep.isForFor = this.isForFor = this.ofTemplate.pushList[this.ofTemplate.pushList.length-1]

                        this.getVal(isObj)
                        Dep.isForFor = false
                        Dep.isForForTo = false

                        // if(!Dep.watcher) if(compare(this.getVerOf().list, _sm[key])) return;

                        var list = this.value, listLen = list.length? list.length : 'object' , originalList = !Dep.watcher? this.getVerOf().list: listLen === 'object'? {}: []

                        Dep.listInfo = { indexOfKeyName: listLen === 'object' ? _listKeyName : _listIndexName, listKey: key }


                        if(this.listNodes === null){
                            this.listNodes = originalList;                          //set last list nodes
                            if (this.isForFor)
                                this.versionKey = addVersion(key, this.ofTemplate[this.ofTemplate.length-1].versionKey)
                            else
                                this.versionKey = addVersion(key)

                            this.version = 0
                            this.originNode = node.cloneNode(true);                 //keep original node
                        }

                        //clear old nodes
                        if(this.listNodes.length > 0){
                            var n, _key
                            for(_key in this.listNodes){
                                if(_key === "length") break;
                                n = this.listNodes[_key]
                                n.parentNode.removeChild(n)
                            }
                            this.version = versionAdd(this.versionKey)
                        }
                        // this.getVerOf().list = JSON.parse(JSON.stringify(list))
                        this.getVerOf().ofTemplate = key

                        //clear
                        this.listNodes = listLen === 'object'? {}: [];
                        var newNode;
                        var i = 0, _key

                        if(isFirst) this.pushOfKey();                  //只有第一次才添加新的版本key
                        for(_key in list){
                            if(_key === _depName) break;
                            newNode = this.originNode.cloneNode(true)
                            this.listNodes[_key] = newNode
                            this.parentNode.insertBefore(newNode, this.nextSibling)
                            Dep.listInfo.indexOfKey = _key

                            Dep.ofTemplate = this.ofTemplate.pushList
                            viewScan(newNode, _sm, this.ofTemplate, true)
                            Dep.ofTemplate = null
                            i++
                        }

                        Dep.listLength = this.listNodes.length = i
                        Dep.listInfo = null
                        Dep.saveTemplate = false
                        Dep.saveTemplateKey = null

                    }
            }
        },
        getVal: function (isObj) {           //get value of data
            if(isObj) Dep.watcher = this;

            Dep.hash = getHash();       //the hash of get value
            Dep.getValList = [];        //the list of data in value string

            this._sm.render = this.render
            this.value = this._sm.render()

            if(isObj) Dep.watcher = null;
        },
        isExpire: function () {
            return  this.ofTemplate ? this.getLastVerOf() ? this.getLastVerOf().version !== this.version : true : undefined
        },
        getLastVerOf:function () {
            return _version[this.ofTemplate[this.ofTemplate.length-1].versionKey]
        },
        getVerOf:function () {
            return _version[this.versionKey]
        },
        pushOfKey:function () {
            if (!this.ofTemplate) {
                this.ofTemplate = [];
                this.ofTemplate.pushList = []
            }  else {
                var ofTemplate = this.ofTemplate
                this.ofTemplate = ofTemplate.concat()
                this.ofTemplate.pushList = ofTemplate.pushList.concat()
            }
            this.ofTemplate.push({key:this.key, versionKey:this.versionKey});
            this.ofTemplate.pushList.push(this.key)
        },
    }

    /**
     * version版本增加，并返回增加后的版本
     */
    function versionAdd(versionKey){
        _version[versionKey].version++
        clearVersion(versionKey)
        return _version[versionKey].version
    }

    /**
     * 添加关联version，并返回生成的新versionKey
     */
    function addVersion(key, parentVersionKey) {
        var versionKey = key+getHash();
        _version[versionKey] = {}
        _version[versionKey].version = 0                               //set list version
        if (parentVersionKey){
            if (!_version[parentVersionKey].child) _version[parentVersionKey].child = []
            _version[parentVersionKey].child.push(versionKey)
        }
        return versionKey
    }

    /**
     * 清除version中过期的版本
     */
    function clearVersion(versionKey) {
        if (_version[versionKey].child){
            _version[versionKey].child.forEach(function (v) {
                clearVersion(v)
                delete _version[v]
            })
            _version[versionKey].child = undefined
        }
    }
    function queueScan() {
        for (var i = 0; i < _queueScan.length; i++){
            var view = _queueScan[i];
            new Watcher(view)
            if(view.type === 'for'){
                view.node.parentNode.removeChild(view.node)
            }
        }
        _queueScan = []
    }

    /*------------------------------sm------------------------------*/
    function SM(obj) {
        this.$el = document.querySelector(obj.el)
        for (var key in obj.methods) this[key] = obj.methods[key]
        this.created = obj.created;
        this.mounted = obj.mounted;
        this._originalHtml = undefined
        this._init(this, obj.data)
        return this
    }
    SM.prototype = {
        $watch: function (key, callback) {
            if(typeof this[key] === 'function') return false
            callback.isExpire = function () { return false; }
            callback.originalVal = this[key]
            Dep.watcher = callback
            Dep.hash = getHash();
            callback.originalVal = this[key]
            Dep.watcher = null
        },
        _init: function(_sm, data) {
            if(typeof this._originalHtml === 'undefined')
                this._originalHtml = this.$el.innerHTML
            else
                this.$el.innerHTML = this._originalHtml
            for(var key in data){
                _sm[key] = data[key]
                watchSM(_sm, _sm, key, data[key])
            }
            if(this.created) this.created.call(this)                              //created
            viewScan(this.$el, this)
            queueScan()
            if(this.mounted) this.mounted.call(this)                              //mounted
        }
    }
    window.SM = SM
}));



