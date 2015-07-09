$(function() {

	var contentPlacement = elementHeight('#navigation-bar'); 
	$('#below-nav').css('margin-top', contentPlacement);

	

$(window).scroll(function(i){
var picPos = elementHeight('#grad_pic'); 

var top = $(window).scrollTop();
var dHeight = $(document).height();
console.log("docPos " +picPos + " top:  " + top + " docHeight " + dHeight);



if (top == 0){
	 $('.scrollFade').css('opacity' , 1);
    
}else{

	$('.scrollFade').css('opacity' ,  .90 - top/picPos);


     }
      
})


});

function elementHeight(element){

return $(element).position().top + $(element).height();

}
