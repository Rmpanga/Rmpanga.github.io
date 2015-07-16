$(function() {


    var active = true;
    var contentPlacement = elementHeight('#cssmenu'); 
    $('#below-nav').css('margin-top', contentPlacement);




    $(window).scroll(function(i){
        var picPos = elementHeight('#carousel'); 

        var top = $(window).scrollTop();
        var dHeight = $(document).height();
        console.log("docPos " +picPos + " top:  " + top + " docHeight " + dHeight);



        if (top == 0){
          $('.scrollFade').css('opacity' , 1);
            
        }else{

         $('.scrollFade').css('opacity' ,  .90 - top/picPos);
            }
    });


   var hidden = "hidden";

    // Standards:
    if (hidden in document)
      document.addEventListener("visibilitychange", onchange);
    else if ((hidden = "mozHidden") in document)
      document.addEventListener("mozvisibilitychange", onchange);
    else if ((hidden = "webkitHidden") in document)
      document.addEventListener("webkitvisibilitychange", onchange);
    else if ((hidden = "msHidden") in document)
      document.addEventListener("msvisibilitychange", onchange);
    // IE 9 and lower:
    else if ("onfocusin" in document)
      document.onfocusin = document.onfocusout = onchange;
    // All others:
    else
      window.onpageshow = window.onpagehide
      = window.onfocus = window.onblur = onchange;



   if( document[hidden] !== undefined )
      onchange({type: document[hidden] ? "blur" : "focus"});
    



});

  function onchange (evt) {

    if (document.hidden){
      active = false;
     }else{
      active = true;
     }
    /*
    var v = "visible", h = "hidden",
        evtMap = {
          focus:v, focusin:v, pageshow:v, blur:h, focusout:h, pagehide:h
        };

    evt = evt || window.event;

   
    if (document.hidden) {

     console.log("Page is hidden");
    } else {
     console.log("Page is active");
     }

      if (evt.type in evtMap){
      console.log("Evt.type in evtMap");
      console.log(evt.type);
     // document.body.className = evtMap[evt.type];
   }
    else
     console.log("Else: " + evt.type);
  
  }



     */


}
    
   


function elementHeight(element){

return $(element).position().top + $(element).height();

}
