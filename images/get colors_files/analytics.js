(function() {

var data = {action:[],_meta:{params:{},logConsole:false}};
var fns = {
		ready: function(value) {
			this._meta.ready = value;
		}
		,logConsole: function(val) {
			this._meta.logConsole=val;
		}
		,sendPageView: function() {
			data.type="pageview";
			var url = genPixel(this);
			// send pixel;
			new Image().src=url;
		}
		,sendError: function(msg,url,line) {
			var data2 = {};
			data2.id = this.id;
			data2.domain = this.domain;
			data2.path = this.path;
			if (typeof this.qs !== "undefined") {
				data2.qs = this.qs;
			}
			if (typeof this.userType !== "undefined") {
				data2.userType = this.userType;
			}
			if (typeof this.ab !== "undefined") {
				data2.ab = this.ab;
			}
			data2.type = "error";
			if (typeof msg !== "undefined") {
				data2.msg=msg;
			}
			if (typeof url !== "undefined") {
				data2.url=url;
			}	
			if (typeof line !== "undefined") {
				data2.line=line;
			}
			var url = genPixel(data2);
			// send pixel;
			new Image().src=url;
		}
		,newAction: function(actionName, actionValue) {
			// should we encode Names? what are the rules?
			if (typeof actionValue === "undefined") {
				this.action.push(actionName);
			} else {
				this.action.push(actionName+"="+encodeURIComponent(actionValue));
			}
		}
		,sendAction: function(actionName, actionValue) {
			if (typeof actionName !== "undefined") {
				fns.newAction.apply(this,arguments);
			}
			var data2 = {};
			data2.id = this.id;
			data2.domain = this.domain;
			data2.path = this.path;
			if (typeof this.qs !== "undefined") {
				data2.qs = this.qs;
			}
			if (typeof this.userType !== "undefined") {
				data2.userType = this.userType;
			}
			if (typeof this.ab !== "undefined") {
				data2.ab = this.ab;
			}
			data2.action = data.action;
			data2.type = "action";
			var url = genPixel(data2);
			// send pixel;
			new Image().src=url;
			data.action.length=0; // also sets data2!
		}
		,setId: function(value) {
				this.id = value;
		}
		,setUserType: function(value) {
				this.userType = value;
		}
		,setDomain: function(value) {
				this.domain = value;
		}
		,setPath: function(value) {
				this.path = value;
		}
		,setAbTest: function(value) {
				this.ab = value;
		}
		,setLocParam: function(value) {
			value = this._meta.params[value];
			if (typeof value !== "undefined")
				this.loc = value[0];
		}
		,setActionParam: function(action) {
			value = this._meta.params[action];
			if (typeof value !== "undefined") {
				this.action = value; // array
			}
		}

		,setUserVar: function(name,value) {}
		,setSessionVar: function() {}
		,setPageVar: function() {}
};

function genPixel(props) {
	var url="http://www.statbot.com/pixel.gif?v=1.0";
	for (v in props) {
		if (v === "_meta")
			continue;
		if (v === "action") {// array
			var arrayList = props[v];
			if (arrayList.length == 0)
				continue;
			url += "&action=";
			var actionV = "";
			for (var i=0;i<arrayList.length;i++) {
				if (i > 0)
					actionV += ","; // encodeURIComponent(",")
				actionV += arrayList[i];
			}
			url += encodeURIComponent(actionV);
		} else {
			url += "&"+v+"="+encodeURIComponent(props[v]);
		}
	}
	url += "&_="+Math.random();
	return url;
}

function processPage(data) {
	data.domain = document.location.hostname;
	data.path = document.location.pathname;
	if (document.location.search) {
		data.qs = document.location.search.substring(1,1024);
		var ppp = data._meta.params;
        var re = /([^=&]+)=([^&]*)/g;
        var param;
        while (param = re.exec(data.qs)) {
        		name = decodeURIComponent(param[1]);
        		ppp[name]= ppp[name] || [];
        		ppp[name].push(decodeURIComponent(param[2]));
        }
	}
	//http://www.html5rocks.com/en/tutorials/webperformance/basics/
	if (typeof window.performance !== "undefined") {
		var t = window.performance.timing;
		var dns = t.domainLookupEnd - t.domainLookupStart;
		var pageLoad = t.loadEventEnd-t.navigationStart; // load the whole page
		var pageTime = t.responseEnd - t.fetchStart; // just the page
		var ttfb = t.responseStart - t.requestStart; // ttfb for page
		//console.log("dns:"+dns);
		//console.log("pageLoad:"+pageLoad);
		//console.log("pageTime:"+pageTime);
		//console.log("ttfb:"+ttfb);
		data.dns = dns;
		data.pageLoad = pageLoad;
		data.pageTime = pageTime;
		data.ttfb = ttfb;
	}
}

function processFunctions(data,q) {
	for (var i=0;i<q.length;i++) {
		var args = Array.prototype.slice.call(q[i]);
		var f = fns[args[0]];
		if (typeof f === "function") {
			if (data._meta.logConsole) {
				console.log("call:"+args.join(" "));
			}
			args.shift();
			f.apply(data,args);
		}
	}
	q.length = 0;
}

function addPush(q) {
	q.push = function (){
		//console.log("push it");
	    /*var ret=*/ Array.prototype.push.apply(this,arguments);
	    //return ret;
	    processFunctions(data,q);
	}
}

function goReady() {
		processPage(data);
		processFunctions(data,window[window['StatBotObject']].q);
		if (typeof data._meta.ready === "function") {
			data._meta.ready();
		}
		addPush(window[window['StatBotObject']].q);
}
var rrr = function(){
	if (/in/.test(document.readyState)) {
		//console.log("keep waiting");
		setTimeout(rrr,9);
	}
	else {
		goReady();
	}
}
rrr();
//if (document.addEventListener)
	//document.addEventListener("DOMContentLoaded",goReady);
//else if (document.attachEvent){
	//document.attachEvent("onreadystatechange", function(){
		//if ( document.readyState === "complete" ) {
			//goReady();
		//}
	//});
//} else {
	//goReady();
//}

}());
