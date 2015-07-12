$(function() {



var contentPlacement = elementHeight('#navigation-bar'); 
$('#below-nav').css('margin-top', contentPlacement);






});

function elementHeight(element){

return $(element).position().top + $(element).height();

}
